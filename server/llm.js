// 大模型转发：浏览器 → 本服务 → 用户自己配置的 OpenAI 兼容接口。
// 很多大模型 API 不允许浏览器跨域直连，所以由服务端转发一次。
// 服务器在公网，转发必须登录后才能用，且只能访问公网 https 地址，防止被当成开放代理或打内网。
// Key 只透传给上游，不落盘、不写日志。
import https from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { z } from "zod";

const v4 = new BlockList();
const v6 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
])
  v4.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
])
  v6.addSubnet(net, bits, "ipv6");

export const privateAddress = (ip) => {
  const v = isIP(ip);
  if (v === 4) return v4.check(ip, "ipv4");
  if (v !== 6) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return v4.check(mapped[1], "ipv4");
  if (/^::ffff:/i.test(ip)) return true;
  return v6.check(ip, "ipv6");
};

const fail = (statusCode, msg) => {
  throw Object.assign(Error(msg), { statusCode });
};

export const llmBody = z.object({
  baseUrl: z.string().trim().max(500),
  apiKey: z.string().trim().min(1).max(500),
  payload: z.record(z.string(), z.unknown()),
});

// 校验并拼出上游地址：只允许 https、默认端口、无账号密码、主机不是内网 IP 字面量。
export function upstreamUrl(baseUrl) {
  let u;
  try {
    u = new URL(baseUrl);
  } catch {
    fail(400, "API 地址格式不对");
  }
  if (u.protocol !== "https:") fail(400, "API 地址必须以 https:// 开头");
  if (u.username || u.password) fail(400, "API 地址里不能带账号密码");
  if (u.port && u.port !== "443") fail(400, "API 地址只支持默认 443 端口");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && privateAddress(host)) fail(400, "不允许访问内网地址");
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host))
    fail(400, "不允许访问内网地址");
  u.search = "";
  u.hash = "";
  u.pathname = u.pathname.replace(/\/+$/, "") + "/chat/completions";
  return u;
}

// DNS 解析后再检查一次，连接用的就是检查过的地址，避免域名指向内网（含 DNS 重绑定）。
export function safeLookup(resolve = dnsLookup) {
  return (host, opts, cb) => {
    resolve(host, { ...opts, all: true }, (err, list) => {
      if (err) return cb(err);
      const addrs = Array.isArray(list) ? list : [{ address: list, family: opts.family }];
      if (!addrs.length || addrs.some((a) => privateAddress(a.address)))
        return cb(Object.assign(Error("blocked address"), { code: "EBLOCKED" }));
      if (opts.all) return cb(null, addrs);
      cb(null, addrs[0].address, addrs[0].family);
    });
  };
}

const MAX_RESPONSE = 4 * 1024 * 1024;

// 默认传输：node:https + 安全解析。测试可注入自己的 transport。
export function httpsTransport({ resolve, connectTimeout = 10000, timeout = 150000 } = {}) {
  const lookup = safeLookup(resolve);
  return (url, { headers, body }) =>
    new Promise((ok, no) => {
      let connectTimer;
      let totalTimer;
      const clearConnectTimer = () => clearTimeout(connectTimer);
      const cleanup = () => {
        clearConnectTimer();
        clearTimeout(totalTimer);
      };
      const reject = (error) => {
        cleanup();
        no(error);
      };
      const req = https.request(
        url,
        { method: "POST", headers, lookup },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on("data", (c) => {
            size += c.length;
            if (size > MAX_RESPONSE) {
              req.destroy(Object.assign(Error("too large"), { code: "ETOOLARGE" }));
              return;
            }
            chunks.push(c);
          });
          res.on("end", () => {
            cleanup();
            ok({
              status: res.statusCode ?? 502,
              contentType: res.headers["content-type"] || "application/json",
              body: Buffer.concat(chunks),
            });
          });
          res.on("error", reject);
        },
      );
      connectTimer = setTimeout(
        () => req.destroy(Object.assign(Error("connection timeout"), { code: "ECONNECTTIMEOUT" })),
        connectTimeout,
      );
      totalTimer = setTimeout(
        () => req.destroy(Object.assign(Error("timeout"), { code: "ETIMEDOUT" })),
        timeout,
      );
      req.on("socket", (socket) => {
        if (req.reusedSocket) {
          clearConnectTimer();
        } else {
          socket.once("secureConnect", clearConnectTimer);
        }
      });
      req.on("error", reject);
      req.end(body);
    });
}

export async function forward(input, transport) {
  const { baseUrl, apiKey, payload } = llmBody.parse(input);
  const url = upstreamUrl(baseUrl);
  const body = JSON.stringify(payload);
  try {
    return await transport(url, {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });
  } catch (e) {
    if (e?.code === "EBLOCKED") fail(400, "不允许访问内网地址");
    if (e?.code === "ECONNECTTIMEOUT") fail(504, "服务器暂时无法连接模型服务，请稍后重试或更换可访问的 API 地址");
    if (e?.code === "ETIMEDOUT") fail(504, "模型服务响应超时");
    if (e?.code === "ETOOLARGE") fail(502, "模型服务返回内容过大");
    if (e?.code === "ENOTFOUND") fail(502, "找不到 API 地址对应的服务器，请检查地址");
    fail(502, "无法连接模型服务，请检查 API 地址");
  }
}
