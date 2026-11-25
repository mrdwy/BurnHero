import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { makeApp } from "../app.js";
import { privateAddress, safeLookup, upstreamUrl } from "../llm.js";

test("上游地址：拼接 /chat/completions，拒绝 http、内网和带账号的地址", () => {
  assert.equal(
    upstreamUrl("https://api.example.com/v1/").href,
    "https://api.example.com/v1/chat/completions",
  );
  assert.equal(
    upstreamUrl("https://api.example.com").href,
    "https://api.example.com/chat/completions",
  );
  for (const bad of [
    "http://api.example.com/v1",
    "https://127.0.0.1/v1",
    "https://10.1.2.3/v1",
    "https://[::1]/v1",
    "https://localhost/v1",
    "https://u:p@api.example.com/v1",
    "https://api.example.com:18081/v1",
    "not a url",
  ])
    assert.throws(() => upstreamUrl(bad), { statusCode: 400 }, bad);
});

test("内网地址判断与解析后拦截", async () => {
  for (const ip of ["127.0.0.1", "10.0.0.8", "172.20.1.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"])
    assert.equal(privateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "140.210.9.105", "2606:4700::1111"])
    assert.equal(privateAddress(ip), false, ip);
  const resolveTo = (address) => (_h, _o, cb) => cb(null, [{ address, family: 4 }]);
  const run = (address) =>
    new Promise((ok) => safeLookup(resolveTo(address))("x.example", {}, (err, addr) => ok(err ? err.code : addr)));
  assert.equal(await run("172.18.0.2"), "EBLOCKED");
  assert.equal(await run("1.2.3.4"), "1.2.3.4");
});

test("POST /api/llm：需登录、原样转发上游、不泄露 Key", async (t) => {
  const player = randomUUID();
  const pool = {
    query: async (sql, args) =>
      sql.startsWith("SELECT id,name,team,consent") && args[0] === player
        ? { rows: [{ id: player, name: "勇者", team: null, consent: null }] }
        : { rows: [] },
  };
  const seen = [];
  const reply = { status: 200, contentType: "application/json", body: Buffer.from('{"choices":[{"message":{"content":"{}"}}]}') };
  const app = await makeApp({
    pool,
    images: {},
    secret: randomBytes(32).toString("hex"),
    llmTransport: async (url, req) => {
      seen.push({ url: url.href, req });
      if (url.hostname === "fail.example") throw Object.assign(Error("x"), { code: "ECONNREFUSED" });
      return url.hostname === "denied.example"
        ? { status: 401, contentType: "application/json", body: Buffer.from('{"error":{"message":"bad key"}}') }
        : reply;
    },
  });
  t.after(() => app.close());
  const token = app.jwt.sign({ sub: player });
  const body = (baseUrl) => ({ baseUrl, apiKey: "sk-test-123", payload: { model: "m", messages: [] } });
  const call = (payload, auth = token) =>
    app.inject({ method: "POST", url: "/api/llm", headers: auth ? { authorization: `Bearer ${auth}` } : {}, payload });

  assert.equal((await call(body("https://api.example.com/v1"), null)).statusCode, 401);
  assert.equal(seen.length, 0);

  const ok = await call(body("https://api.example.com/v1/"));
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().choices[0].message.content, "{}");
  assert.equal(seen[0].url, "https://api.example.com/v1/chat/completions");
  assert.equal(seen[0].req.headers.Authorization, "Bearer sk-test-123");
  assert.deepEqual(JSON.parse(seen[0].req.body), { model: "m", messages: [] });

  const denied = await call(body("https://denied.example/v1"));
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.json().error.message, "bad key");

  const http = await call(body("http://api.example.com/v1"));
  assert.equal(http.statusCode, 400);
  const inner = await call(body("https://192.168.1.10/v1"));
  assert.equal(inner.statusCode, 400);
  assert.equal(inner.json().error, "不允许访问内网地址");
  assert.equal((await call({ baseUrl: "https://a.example" })).statusCode, 400);

  const down = await call(body("https://fail.example/v1"));
  assert.equal(down.statusCode, 502);
  assert.ok(!down.body.includes("sk-test-123"));
  assert.equal(seen.length, 3);
});
