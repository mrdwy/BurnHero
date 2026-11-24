import Fastify from "fastify";
import jwt from "@fastify/jwt";
import limit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import cors from "@fastify/cors";
import {
  randomUUID,
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { slots, report, damage } from "./score.js";
import { shiftDate, weekKey } from "./rules/targets.js";
const scrypt = promisify(derive);
const auth = z.object({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(
      z.union([z.email().max(254), z.string().regex(/^\+?[1-9]\d{7,14}$/)]),
    ),
  password: z.string().min(10).max(128),
  name: z.string().trim().min(1).max(24).optional(),
});
const fail = (statusCode, msg) => {
  throw Object.assign(Error(msg), { statusCode });
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dayParam = (d) => {
  z.iso.date().parse(d);
  if (d > today()) fail(400, "日期不能在未来");
  return d;
};
const uuid = (v) => z.uuid().parse(v);
export async function makeApp({
  pool,
  images,
  secret,
  webRoot,
  clock = today,
}) {
  if (!secret || Buffer.byteLength(secret) < 32)
    throw Error("JWT_SECRET too short");
  await pool.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  const app = Fastify({ bodyLimit: 8 * 1024 * 1024, logger: false });
  await app.register(jwt, { secret, sign: { expiresIn: "12h" } });
  await app.register(limit, { max: 180, timeWindow: "1 minute" });
  const origins = (process.env.APP_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length)
    await app.register(cors, {
      origin: origins,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    });
  if (webRoot) await app.register(staticFiles, { root: webRoot });
  app.addContentTypeParser(
    ["image/jpeg", "image/png", "image/webp"],
    { parseAs: "buffer" },
    (_r, b, done) => done(null, b),
  );
  app.setErrorHandler((e, _r, reply) => {
    const code =
      e instanceof z.ZodError
        ? 400
        : e.code === "23505"
          ? 409
          : (e.statusCode ?? 500);
    reply
      .code(code)
      .send({
        error:
          code === 500
            ? "服务暂时不可用"
            : code === 409
              ? "记录冲突"
              : e instanceof z.ZodError
                ? "输入格式无效"
                : e.message,
      });
  });
  const q = (sql, args) => pool.query(sql, args);
  async function transaction(work) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const value = await work(c);
      await c.query("COMMIT");
      return value;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  app.get("/health", async () => {
    await q("SELECT 1");
    return { ok: true };
  });
  await app.register(
    async (api) => {
      const rate = {
        config: { rateLimit: { max: 12, timeWindow: "1 minute" } },
      };
      api.post("/register", rate, async (r) => {
        const { login, password, name } = auth.parse(r.body);
        const id = randomUUID(),
          salt = randomBytes(16).toString("hex");
        const hash = (await scrypt(password, salt, 64)).toString("hex");
        await q(
          "INSERT INTO players(id,login,password,name) VALUES($1,$2,$3,$4)",
          [id, login, `${salt}:${hash}`, name ?? "勇者"],
        );
        return { id, token: app.jwt.sign({ sub: id }) };
      });
      api.post("/login", rate, async (r) => {
        const { login, password } = auth.parse(r.body);
        const p = (
          await q("SELECT id,password FROM players WHERE login=$1", [login])
        ).rows[0];
        const [salt, hash] = (
          p?.password ?? "00000000000000000000000000000000:"
        ).split(":");
        const key = await scrypt(password, salt, 64);
        if (!p || !timingSafeEqual(key, Buffer.from(hash, "hex")))
          fail(401, "账号或密码错误");
        return { id: p.id, token: app.jwt.sign({ sub: p.id }) };
      });
    },
    { prefix: "/api" },
  );
  await app.register(
    async (api) => {
      api.addHook("onRequest", async (r, reply) => {
        reply.header("Cache-Control", "no-store");
        await r.jwtVerify();
        r.player = (
          await q("SELECT id,name,team,consent FROM players WHERE id=$1", [
            r.user.sub,
          ])
        ).rows[0];
        if (!r.player) fail(401, "请重新登录");
      });
      const team = (r) => r.player.team ?? fail(403, "请先加入战队");
      api.get("/me", async (r) => ({
        ...r.player,
        guild: r.player.team
          ? (
              await q("SELECT name,code,capacity FROM teams WHERE id=$1", [
                r.player.team,
              ])
            ).rows[0]
          : null,
      }));
      api.put("/consent", async (r) => {
        const { allow } = z.object({ allow: z.boolean() }).parse(r.body);
        return transaction(async (c) => {
          await c.query(
            "UPDATE players SET consent=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1",
            [r.player.id, allow],
          );
          if (!allow)
            await c.query("UPDATE posts SET shares='{}' WHERE player=$1", [
              r.player.id,
            ]);
          return { allow };
        });
      });
      async function join(c, r, id) {
        const changed = await c.query(
          "UPDATE players SET team=$1 WHERE id=$2 AND team IS NULL",
          [id, r.player.id],
        );
        if (!changed.rowCount) fail(409, "已加入战队");
        return { id };
      }
      api.post("/teams", async (r) => {
        const { name, capacity } = z
          .object({
            name: z.string().trim().min(1).max(24),
            capacity: z.number().int().min(4).max(8),
          })
          .parse(r.body);
        return transaction(async (c) => {
          const id = randomUUID(),
            code = randomBytes(8).toString("hex");
          await c.query("INSERT INTO teams VALUES($1,$2,$3,$4)", [
            id,
            name,
            code,
            capacity,
          ]);
          await join(c, r, id);
          return { id, code };
        });
      });
      api.post("/teams/join", async (r) => {
        const { code } = z
          .object({ code: z.string().trim().length(16) })
          .parse(r.body);
        return transaction(async (c) => {
          const t = (
            await c.query("SELECT * FROM teams WHERE code=$1 FOR UPDATE", [
              code,
            ])
          ).rows[0];
          if (!t) fail(404, "邀请码无效");
          if (
            Number(
              (
                await c.query("SELECT count(*) FROM players WHERE team=$1", [
                  t.id,
                ])
              ).rows[0].count,
            ) >= t.capacity
          )
            fail(409, "战队已满");
          return join(c, r, t.id);
        });
      });
      const lockedPlayer = async (c, r) =>
        (
          await c.query("SELECT * FROM players WHERE id=$1 FOR UPDATE", [
            r.player.id,
          ])
        ).rows[0] ?? fail(401, "账号不存在");
      async function recalc(c, p, date) {
        const history = (
          await c.query(
            "SELECT day::text,data,ARRAY(SELECT slot FROM media WHERE player=posts.player AND day=posts.day) photos FROM posts WHERE player=$1 AND day<=$2 ORDER BY day",
            [p.id, date],
          )
        ).rows;
        return damage(history, date);
      }
      async function ensureWeek(c, id, w) {
        await c.query(
          "INSERT INTO weeks(team,week,hp) SELECT $1,$2,round(count(*)*25*7*0.7) FROM players WHERE team=$1 ON CONFLICT DO NOTHING",
          [id, w],
        );
        return (
          await c.query(
            "SELECT * FROM weeks WHERE team=$1 AND week=$2 FOR UPDATE",
            [id, w],
          )
        ).rows[0];
      }
      api.put("/days/:day", async (r) => {
        const date = dayParam(r.params.day),
          data = report.parse(r.body),
          { shares } = data;
        delete data.shares;
        team(r);
        return transaction(async (c) => {
          const p = await lockedPlayer(c, r);
          if (shares.length && !p.consent)
            fail(403, "请先单独授权健康信息共享");
          const w = await ensureWeek(c, p.team, weekKey(date));
          const post = (
            await c.query(
              "INSERT INTO posts(id,player,team,day,data,shares,damage) VALUES($1,$2,$3,$4,$5,$6,0) ON CONFLICT(player,day) DO UPDATE SET data=excluded.data,shares=excluded.shares RETURNING id,damage",
              [randomUUID(), p.id, p.team, date, data, shares],
            )
          ).rows[0];
          if (!w.settled) {
            post.damage = await recalc(c, p, date);
            await c.query("UPDATE posts SET damage=$1 WHERE id=$2", [
              post.damage,
              post.id,
            ]);
          }
          return post;
        });
      });
      api.put("/days/:day/photos/:slot", async (r) => {
        const date = dayParam(r.params.day),
          slot = z.enum(slots).parse(r.params.slot);
        team(r);
        if (!Buffer.isBuffer(r.body)) fail(415, "需要图片");
        const id = randomUUID();
        await images.put(id, r.body);
        let old;
        try {
          await transaction(async (c) => {
            const p = await lockedPlayer(c, r);
            const post = (
              await c.query("SELECT id FROM posts WHERE player=$1 AND day=$2", [
                p.id,
                date,
              ])
            ).rows[0];
            if (!post) fail(404, "请先保存打卡");
            old = (
              await c.query(
                "SELECT id FROM media WHERE player=$1 AND day=$2 AND slot=$3",
                [p.id, date, slot],
              )
            ).rows[0];
            await c.query(
              "INSERT INTO media VALUES($1,$2,$3,$4) ON CONFLICT(player,day,slot) DO UPDATE SET id=excluded.id",
              [id, p.id, date, slot],
            );
            const w = await ensureWeek(c, p.team, weekKey(date));
            if (!w.settled)
              await c.query("UPDATE posts SET damage=$1 WHERE id=$2", [
                await recalc(c, p, date),
                post.id,
              ]);
          });
        } catch (e) {
          await images.remove(id);
          throw e;
        }
        if (old) await images.remove(old.id);
        return { id };
      });
      api.get("/media/:id", async (r, reply) => {
        const id = uuid(r.params.id);
        const found = await q(
          "SELECT m.id FROM media m JOIN players p ON p.id=m.player JOIN posts s ON s.player=m.player AND s.day=m.day WHERE m.id=$1 AND (p.id=$2 OR (s.team=$3 AND p.consent IS NOT NULL AND m.slot=ANY(s.shares)))",
          [id, r.player.id, r.player.team],
        );
        if (!found.rowCount) fail(404, "图片不存在");
        return reply.type("image/webp").send(await images.get(id));
      });
      api.get("/feed", async (r) => {
        const rows = (
          await q(
            `SELECT s.id,s.day::text,p.name,s.player,CASE WHEN p.consent IS NULL THEN '{}'::text[] ELSE s.shares END shares,s.data,
      (SELECT jsonb_object_agg(slot,m.id) FROM media m WHERE m.player=s.player AND m.day=s.day) photos,
      (SELECT count(*)::int FROM likes WHERE post=s.id) likes,
      (SELECT jsonb_agg(jsonb_build_object('name',a.name,'body',c.body) ORDER BY c.at) FROM comments c JOIN players a ON a.id=c.player WHERE c.post=s.id) comments
      FROM posts s JOIN players p ON p.id=s.player WHERE s.team=$1 ORDER BY s.day DESC,s.id LIMIT 100`,
            [team(r)],
          )
        ).rows;
        return rows.map((p) => ({
          id: p.id,
          day: p.day,
          name: p.name,
          checked: true,
          likes: p.likes,
          comments: p.comments ?? [],
          ...Object.fromEntries(
            ["weight", "band"]
              .filter((k) => p.shares.includes(k))
              .map((k) => [k, p.data[k]]),
          ),
          photos: Object.fromEntries(
            Object.entries(p.photos ?? {}).filter(([k]) =>
              p.shares.includes(k),
            ),
          ),
        }));
      });
      async function memberPost(r) {
        const post = uuid(r.params.id);
        if (
          !(
            await q("SELECT 1 FROM posts WHERE id=$1 AND team=$2", [
              post,
              team(r),
            ])
          ).rowCount
        )
          fail(404, "动态不存在");
        return post;
      }
      api.put("/posts/:id/like", async (r) => {
        await q("INSERT INTO likes VALUES ($1,$2) ON CONFLICT DO NOTHING", [
          await memberPost(r),
          r.player.id,
        ]);
        return { ok: true };
      });
      api.post("/posts/:id/comments", async (r) => {
        const { body } = z
          .object({ body: z.string().trim().min(1).max(500) })
          .parse(r.body);
        const id = randomUUID();
        await q(
          "INSERT INTO comments(id,post,player,body) VALUES ($1,$2,$3,$4)",
          [id, await memberPost(r), r.player.id, body],
        );
        return { id };
      });
      api.get("/boss", async (r) => {
        const w = weekKey(clock());
        return transaction(async (c) => {
          const row = await ensureWeek(c, team(r), w);
          const sum = (
            await c.query(
              "SELECT coalesce(sum(damage),0) damage FROM posts WHERE team=$1 AND day BETWEEN $2 AND $3",
              [team(r), w, shiftDate(w, 6)],
            )
          ).rows[0].damage;
          return {
            week: w,
            hp: row.hp,
            damage: sum,
            remaining: Math.max(0, row.hp - sum),
            settled: row.settled,
          };
        });
      });
      api.post("/boss/:week/settle", async (r) => {
        const w = dayParam(r.params.week);
        if (w !== weekKey(w) || clock() < shiftDate(w, 6))
          fail(409, "尚不能结算");
        return transaction(async (c) => {
          const id = team(r);
          const row = (
            await c.query(
              "SELECT * FROM weeks WHERE team=$1 AND week=$2 FOR UPDATE",
              [id, w],
            )
          ).rows[0];
          if (!row) fail(404, "无该周挑战");
          if (!row.settled) {
            await c.query(
              `WITH credit AS (SELECT p.id,coalesce(sum(s.damage),0) score FROM players p LEFT JOIN posts s ON s.player=p.id AND s.team=p.team AND s.day BETWEEN $2 AND $3 WHERE p.team=$1 GROUP BY p.id) INSERT INTO payouts SELECT $1,$2,id,CASE WHEN sum(score) OVER() >= $4 THEN floor(200*count(*) OVER()*score/greatest(1,sum(score) OVER()))::int ELSE 10 END FROM credit`,
              [id, w, shiftDate(w, 6), row.hp],
            );
            await c.query(
              "UPDATE weeks SET settled=true WHERE team=$1 AND week=$2",
              [id, w],
            );
          }
          return {
            coins:
              (
                await c.query(
                  "SELECT coins FROM payouts WHERE player=$1 AND week=$2 AND team=$3",
                  [r.player.id, w, id],
                )
              ).rows[0]?.coins ?? 0,
          };
        });
      });
      api.get("/me/export", async (r) => {
        const id = r.player.id;
        const account = (
          await q(
            "SELECT id,name,login,team,consent FROM players WHERE id=$1",
            [id],
          )
        ).rows[0];
        const out = { account };
        for (const t of ["posts", "media", "likes", "comments", "payouts"])
          out[t] = (await q(`SELECT * FROM ${t} WHERE player=$1`, [id])).rows;
        for (const file of out.media) file.download = `/api/media/${file.id}`;
        return out;
      });
      api.delete("/me", async (r) => {
        await transaction(async (c) => {
          await lockedPlayer(c, r);
          const files = (
            await c.query("SELECT id FROM media WHERE player=$1", [r.player.id])
          ).rows;
          for (const f of files) await images.remove(f.id);
          await c.query("DELETE FROM players WHERE id=$1", [r.player.id]);
        });
        return { deleted: true };
      });
    },
    { prefix: "/api" },
  );
  return app;
}
