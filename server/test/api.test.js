import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import sharp from "sharp";
import { makeApp } from "../app.js";
import { localImages } from "../images.js";
import { damage } from "../score.js";
const day = "2026-11-21";
const data = {
  profile: {
    age: 28,
    sex: "male",
    height: 175,
    startWeight: 72,
    targetWeight: 70,
    workoutDays: 3,
  },
  weight: 72,
  meals: { breakfast: 700, lunch: 700, dinner: 700 },
  band: { steps: 8000, total_min: 450 },
  training: { resistance: 30, stretch: 15 },
};
test("当日来源折算、周上限前结算、补给不足归零", () => {
  const row = { day, data };
  const actual = damage([row], day);
  assert.ok(actual > 0 && actual <= 40);
  assert.equal(damage([{ day, data: { ...data, meals: {} } }], day), 0);
});
test("成员与非成员、授权撤销、图片清理、周结算和导出删除", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "burnhero-pg-"));
  const port = 39341;
  const pw = randomBytes(24).toString("hex");
  const db = new EmbeddedPostgres({
    databaseDir: join(dir, "pg"),
    port,
    user: "postgres",
    password: pw,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await db.initialise();
  await db.start();
  const pool = new pg.Pool({
    port,
    user: "postgres",
    password: pw,
    host: "127.0.0.1",
    database: "postgres",
  });
  const images = localImages(join(dir, "img"));
  const app = await makeApp({
    pool,
    images,
    secret: randomBytes(32).toString("hex"),
    clock: () => "2026-11-22",
  });
  t.after(async () => {
    await app.close();
    await pool.end();
    await db.stop();
    await rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 12,
      retryDelay: 250,
    });
  });
  const call = async (
    method,
    path,
    token,
    payload,
    code = 200,
    headers = {},
  ) => {
    const r = await app.inject({
      method,
      url: `/api${path}`,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      payload,
    });
    assert.equal(
      r.statusCode,
      code,
      `${method} ${path} ${r.statusCode} ${r.headers["content-type"]?.includes("json") ? r.body.replace(/"token":"[^"]+"/g, '"token":"…"') : ""}`,
    );
    return r.headers["content-type"]?.includes("json")
      ? r.json()
      : r.rawPayload;
  };
  const reg = async (name) =>
    (
      await call("POST", "/register", null, {
        name,
        login: `${name}@example.org`,
        password: pw,
      })
    ).token;
  const a = await reg("a"),
    b = await reg("b"),
    outsider = await reg("c");
  await call("POST", "/login", null, { login: "a@example.org", password: pw });
  await call("GET", "/feed", null, undefined, 401);
  const team = await call("POST", "/teams", a, { name: "A", capacity: 4 });
  await call("POST", "/teams/join", b, { code: team.code });
  await call("POST", "/teams", outsider, { name: "C", capacity: 4 });
  await call("PUT", `/days/${day}`, a, { ...data, shares: ["weight"] }, 403);
  const post = await call("PUT", `/days/${day}`, a, data);
  const image = await sharp({
    create: { width: 100, height: 60, channels: 3, background: "blue" },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const media = await call("PUT", `/days/${day}/photos/scale`, a, image, 200, {
    "content-type": "image/jpeg",
  });
  let feed = await call("GET", "/feed", b);
  assert.equal(feed[0].weight, undefined);
  assert.deepEqual(feed[0].photos, {});
  await call("GET", `/media/${media.id}`, b, undefined, 404);
  await call("PUT", "/consent", a, { allow: true });
  const update = () =>
    call("PUT", `/days/${day}`, a, { ...data, shares: ["scale", "weight"] });
  await update();
  await update();
  feed = await call("GET", "/feed", b);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].weight, 72);
  const photo = await call("GET", `/media/${media.id}`, b);
  const meta = await sharp(photo).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.exif, undefined);
  await call("GET", `/media/${media.id}`, outsider, undefined, 404);
  await call("PUT", `/posts/${post.id}/like`, outsider, {}, 404);
  await call("PUT", `/posts/${post.id}/like`, b, {});
  await call("PUT", `/posts/${post.id}/like`, b, {});
  await call("POST", `/posts/${post.id}/comments`, b, { body: "加油" });
  feed = await call("GET", "/feed", a);
  assert.equal(feed[0].likes, 1);
  assert.equal(feed[0].comments.length, 1);
  const boss = await call("GET", "/boss", a);
  assert.equal(boss.damage, post.damage);
  const result = await call("POST", `/boss/${boss.week}/settle`, a, {});
  assert.deepEqual(result, { coins: 10 });
  assert.deepEqual(
    await call("POST", `/boss/${boss.week}/settle`, a, {}),
    result,
  );
  await call("PUT", "/consent", a, { allow: false });
  await call("GET", `/media/${media.id}`, b, undefined, 404);
  const ex = await call("GET", "/me/export", a);
  assert.equal(ex.media.length, 1);
  assert.equal(ex.posts.length, 1);
  assert.ok(!("password" in ex.account));
  await call("DELETE", "/me", a);
  await call("GET", "/me", a, undefined, 401);
  assert.deepEqual(await readdir(join(dir, "img")), []);
  assert.deepEqual(await call("GET", "/feed", b), []);
});
