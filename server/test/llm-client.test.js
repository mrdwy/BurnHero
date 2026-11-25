import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = stripTypeScriptTypes(await readFile(new URL("../../web/src/llmRequest.ts", import.meta.url), "utf8"));
const { requestModel, withModelRetry } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const config = { baseUrl: "https://model.example/v1", apiKey: "test-only-credential", payload: { model: "mock" } };

for (const [status, body] of [
  [504, "<html>Gateway Time-out</html>"], [502, "<html>Bad Gateway</html>"],
  [401, JSON.stringify({ error: { message: "bad key" } })], [429, JSON.stringify({ error: "rate limited" })],
  [504, JSON.stringify({ error: "服务器暂时无法连接模型服务，请稍后重试或更换可访问的 API 地址" })],
  [200, "<html>unexpected proxy page</html>"],
]) {
  test(`HTTP ${status} ${body.startsWith("<") ? "HTML" : "JSON"}失败不自动重发且不显示原始正文`, async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response(body, { status }));
    await assert.rejects(withModelRetry(() => requestModel(config)), (error) => {
      assert.doesNotMatch(error.message, /<html>|Gateway|unexpected proxy|bad key|test-only-credential/);
      assert.match(error.message, /超时|连接|Key|限流|格式/);
      return true;
    });
    assert.equal(fetch.mock.callCount(), 1);
  });
}

test("网络中断、响应读取中断和前端超时只发送一次", async (t) => {
  for (const mode of ["network", "body", "timeout"]) {
    await t.test(mode, async (t) => {
      const fetch = t.mock.method(globalThis, "fetch", async () => {
        if (mode === "body") return { text: async () => { throw TypeError("stream reset"); } };
        throw mode === "timeout" ? new DOMException("timed out", "TimeoutError") : TypeError("failed to fetch");
      });
      await assert.rejects(withModelRetry(() => requestModel(config)), /已保留输入内容/);
      assert.equal(fetch.mock.callCount(), 1);
    });
  }
});

test("仅模型结果格式不正确时重试一次，成功携带登录凭据", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: fetch.mock.callCount() === 0 ? "not JSON" : '{"ok":true}' } }] })));
  const value = await withModelRetry(async () => JSON.parse(await requestModel(config, "test-session")));
  assert.deepEqual(value, { ok: true });
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(fetch.mock.calls[0].arguments[1].headers.Authorization, "Bearer test-session");
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), config);
});

test("模型始终返回错误格式最多尝试两次", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [] })));
  await assert.rejects(withModelRetry(() => requestModel(config)), /有效内容/);
  assert.equal(fetch.mock.callCount(), 2);
});

test("上游原始错误即使含凭据也不会进入界面", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: `rejected ${config.apiKey}` } }), { status: 403 }));
  await assert.rejects(requestModel(config), (error) => !error.message.includes(config.apiKey));
});

test("仅BurnHero登录失效清会话，模型401保留会话", async (t) => {
  const removed = [];
  const events = [];
  for (const [name, value] of Object.entries({
    localStorage: { removeItem: (key) => removed.push(key) },
    sessionStorage: { removeItem: (key) => removed.push(key) },
    window: { dispatchEvent: (event) => events.push(event.type) },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  let local = false;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: local ? "请重新登录" : { message: "model unauthorized" } }), { status: 401 }));
  await assert.rejects(requestModel(config), /模型服务拒绝/);
  assert.deepEqual(removed, []);
  local = true;
  await assert.rejects(requestModel(config), /登录已失效/);
  assert.deepEqual(removed, ["guild-session", "guild-session"]);
  assert.deepEqual(events, ["burnhero-session"]);
});
