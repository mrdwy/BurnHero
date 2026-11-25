import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { EventEmitter } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { httpsTransport } from "../llm.js";
import { makeApp } from "../app.js";

function fixture(t, options = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = new EventEmitter();
  const socket = new EventEmitter();
  const response = new EventEmitter();
  response.statusCode = 200;
  response.headers = { "content-type": "application/json" };
  request.end = () => {};
  request.destroy = t.mock.fn((error) => request.emit("error", error));
  let onResponse;
  t.mock.method(https, "request", (_url, _options, callback) => {
    onResponse = callback;
    return request;
  });
  const result = httpsTransport({ connectTimeout: 100, timeout: 500, ...options })(
    new URL("https://model.example/v1/chat/completions"), { headers: {}, body: "{}" },
  );
  return {
    result, request, response, socket,
    connect() { request.emit("socket", socket); socket.emit("secureConnect"); },
    respond() { onResponse(response); },
  };
}

for (const phase of ["DNS未返回", "TCP未连接", "TLS握手未完成"]) {
  test(`${phase}：在建连截止时间销毁请求，并取消总期限`, async (t) => {
    const f = fixture(t);
    if (phase !== "DNS未返回") f.request.emit("socket", f.socket);
    if (phase === "TLS握手未完成") f.socket.emit("connect");
    const rejected = assert.rejects(f.result, { code: "ECONNECTTIMEOUT" });
    t.mock.timers.tick(100);
    await rejected;
    t.mock.timers.tick(1000);
    assert.equal(f.request.destroy.mock.callCount(), 1);
  });
}

test("TLS连接成功后取消建连期限，允许较慢响应，完成后清除总计时器", async (t) => {
  const f = fixture(t);
  f.connect();
  t.mock.timers.tick(200);
  assert.equal(f.request.destroy.mock.callCount(), 0);
  f.respond();
  f.response.emit("data", Buffer.from('{"ok":true}'));
  f.response.emit("end");
  assert.equal((await f.result).body.toString(), '{"ok":true}');
  t.mock.timers.tick(1000);
  assert.equal(f.request.destroy.mock.callCount(), 0);
});

test("持续分块响应仍受请求总期限限制", async (t) => {
  const f = fixture(t);
  f.connect();
  f.respond();
  for (let chunk = 0; chunk < 4; chunk++) {
    t.mock.timers.tick(100);
    f.response.emit("data", Buffer.from("x"));
  }
  const rejected = assert.rejects(f.result, { code: "ETIMEDOUT" });
  t.mock.timers.tick(100);
  await rejected;
  assert.equal(f.request.destroy.mock.callCount(), 1);
});

test("复用已建立的TLS连接不再触发建连超时", async (t) => {
  const f = fixture(t);
  f.request.reusedSocket = true;
  f.request.emit("socket", f.socket);
  t.mock.timers.tick(200);
  f.respond();
  f.response.emit("end");
  await f.result;
  t.mock.timers.tick(1000);
  assert.equal(f.request.destroy.mock.callCount(), 0);
});

test("连接错误和响应中断都清除期限，不产生第二次销毁", async (t) => {
  for (const source of ["request", "response"]) {
    await t.test(source, async (t) => {
      const f = fixture(t);
      const rejected = assert.rejects(f.result, { code: "ECONNRESET" });
      if (source === "response") { f.connect(); f.respond(); }
      f[source].emit("error", Object.assign(Error("connection reset"), { code: "ECONNRESET" }));
      await rejected;
      t.mock.timers.tick(1000);
      assert.equal(f.request.destroy.mock.callCount(), 0);
    });
  }
});

test("/api/llm 连接及响应超时返回中文JSON，不泄露上游错误和凭据", async (t) => {
  const player = randomUUID();
  let code = "ECONNECTTIMEOUT";
  const app = await makeApp({
    pool: { query: async (sql) => ({ rows: sql.startsWith("SELECT id,name,team,consent") ? [{ id: player }] : [] }) },
    images: {}, secret: randomBytes(32).toString("hex"),
    llmTransport: async () => { throw Object.assign(Error("sensitive upstream detail"), { code }); },
  });
  t.after(() => app.close());
  const token = app.jwt.sign({ sub: player });
  for (const expected of ["ECONNECTTIMEOUT", "ETIMEDOUT"]) {
    code = expected;
    const result = await app.inject({ method: "POST", url: "/api/llm", headers: { authorization: `Bearer ${token}` },
      payload: { baseUrl: "https://model.example/v1", apiKey: "test-only-credential", payload: {} } });
    assert.equal(result.statusCode, 504);
    assert.match(result.headers["content-type"], /application\/json/);
    assert.match(result.json().error, expected === "ECONNECTTIMEOUT" ? /无法连接模型服务/ : /响应超时/);
    assert.ok(!result.body.includes("test-only-credential"));
    assert.ok(!result.body.includes("sensitive upstream detail"));
  }
});
