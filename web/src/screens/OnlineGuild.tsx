import { useEffect, useState } from "react";
import { useStore, today } from "../store";
import {
  request,
  flush,
  pending,
  save,
  remove,
  group,
  type Session,
} from "../guildClient";
import { clearSession, readSession, saveSession } from "../session";
const labels: Record<string, string> = {
  breakfast: "早餐照片",
  lunch: "午餐照片",
  dinner: "晚餐照片",
  scale: "体重秤照片",
  weight: "体重",
  band: "手环数据",
};
const photoSlots = ["breakfast", "lunch", "dinner", "scale"];
type Guild = { name: string; code: string; capacity: number };
type Feed = {
  id: string;
  name: string;
  day: string;
  weight?: number;
  band?: Record<string, number>;
  photos: Record<string, string>;
  likes: number;
  comments: { name: string; body: string }[];
};
function Media({ s, id }: { s: Session; id: string }) {
  const [url, set] = useState("");
  useEffect(() => {
    let alive = true,
      src = "";
    request(s, `/media/${id}`)
      .then((r) => r.blob())
      .then((b) => {
        if (alive) {
          src = URL.createObjectURL(b);
          set(src);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [s, id]);
  return url ? (
    <img
      src={url}
      alt="队友共享照片"
      style={{ maxWidth: "100%", maxHeight: 210 }}
    />
  ) : null;
}
export default function OnlineGuild() {
  const state = useStore((x) => x),
    [s, session] = useState<Session | null>(readSession),
    [origin, address] = useState(
      localStorage.getItem("guild-server") || location.origin,
    ),
    [login, account] = useState(""),
    [pw, password] = useState("");
  const [guild, team] = useState<Guild | null>(() =>
      s ? JSON.parse(sessionStorage.getItem("guild-team") || "null") : null,
    ),
    [name, title] = useState(""),
    [code, invite] = useState(""),
    [cap, capacity] = useState(4),
    [date, day] = useState(today()),
    [files, pictures] = useState<Record<string, File>>({}),
    [shares, share] = useState<string[]>([]),
    [consent, allow] = useState(false);
  const [feed, posts] = useState<Feed[]>([]),
    [boss, challenge] = useState<{
      week: string;
      hp: number;
      remaining: number;
    } | null>(null),
    [msg, notice] = useState(""),
    [comments, write] = useState<Record<string, string>>({}),
    [busy, working] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    working(true);
    try {
      await fn();
    } catch (e) {
      notice(e instanceof Error ? e.message : "请检查连接");
    } finally {
      working(false);
    }
  };
  async function refresh(user: Session) {
    const me = await (await request(user, "/me")).json();
    team(me.guild);
    allow(!!me.consent);
    sessionStorage.setItem("guild-team", JSON.stringify(me.guild));
    if (me.guild) {
      posts(await (await request(user, "/feed")).json());
      challenge(await (await request(user, "/boss")).json());
    }
  }
  useEffect(() => {
    if (!s) return;
    let mounted = true;
    const sync = async () => {
      try {
        const n = await flush(s);
        if (mounted) {
          await refresh(s);
          if (n) notice(`已同步 ${n} 条打卡`);
        }
      } catch (e) {
        if (mounted)
          notice(
            `${e instanceof Error ? e.message : "连接失败"}，待同步打卡保存在本机`,
          );
      }
    };
    void sync();
    window.addEventListener("online", sync);
    return () => {
      mounted = false;
      window.removeEventListener("online", sync);
    };
  }, [s]);
  function clear() {
    clearSession();
    session(null);
    team(null);
    posts([]);
    share([]);
    allow(false);
    pictures({});
    challenge(null);
  }
  async function auth(register: boolean) {
    const url = new URL(origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error("请输入 HTTP 或 HTTPS 服务地址");
    const base = { origin: url.origin, id: "", token: "" };
    const result = await (
      await request(base, register ? "/register" : "/login", "POST", {
        login,
        password: pw,
        name: state.profile?.name,
      })
    ).json();
    const user = { ...base, ...result };
    localStorage.setItem("guild-server", base.origin);
    saveSession(user);
    password("");
    session(user);
    notice("已登录");
  }
  async function checkin() {
    if (!s) return;
    const d = state.days[date];
    const p = state.profile;
    if (!d && !Object.keys(files).length)
      throw Error("请先记录当天数据或选择照片");
    const owner = group(s);
    const key = owner + "|" + date;
    const old = (await pending(s)).find((x) => x.key === key);
    const band = Object.fromEntries(
      ["steps", "total_min", "exercise_min"].flatMap((k) => {
        const v = d?.health?.[k as "steps"];
        return v == null ? [] : [[k, v]];
      }),
    );
    const data = {
      profile: p
        ? {
            sex: p.sex,
            age: p.age,
            height: p.height,
            startWeight: p.startWeight,
            targetWeight: p.targetWeight,
            workoutDays: p.workoutDays,
          }
        : undefined,
      weight: d?.weight,
      meals: Object.fromEntries(
        Object.entries(d?.meals ?? {})
          .filter(([k]) => photoSlots.slice(0, 3).includes(k))
          .map(([k, m]) => [k, m.total_kcal]),
      ),
      band,
      shares,
    };
    await save({
      key,
      owner,
      day: date,
      data,
      revision: `${Date.now()}:${Math.random()}`,
      files: { ...old?.files, ...files },
    });
    pictures({});
    notice("打卡已保存在本机，等待同步");
    if (navigator.onLine) {
      await flush(s);
      await refresh(s);
      notice("打卡已同步");
    }
  }
  async function exportAll() {
    if (!s) return;
    const data = await (await request(s, "/me/export")).json();
    for (const f of data.media) {
      const blob = await (await request(s, `/media/${encodeURIComponent(f.id)}`)).blob();
      f.image = await new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = no;
        r.readAsDataURL(blob);
      });
    }
    const u = URL.createObjectURL(
      new Blob([JSON.stringify(data)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = "burnhero-guild.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 5000);
  }
  const btn = (label: string, fn: () => Promise<void>) => (
    <button disabled={busy} className="btn ghost" onClick={() => void run(fn)}>
      {label}
    </button>
  );
  return (
    <section className="screen col">
      <h1>线上战队</h1>
      <p role="status">{msg}</p>
      {!s ? (
        <>
          <label>
            服务器地址
            <input value={origin} onChange={(e) => address(e.target.value)} />
          </label>
          <label>
            手机号或邮箱
            <input value={login} onChange={(e) => account(e.target.value)} />
          </label>
          <label>
            密码（至少 10 字符）
            <input
              type="password"
              value={pw}
              onChange={(e) => password(e.target.value)}
            />
          </label>
          {btn("登录", () => auth(false))}
          {btn("注册", () => auth(true))}
        </>
      ) : (
        <>
          {!guild ? (
            <>
              <label>
                战队名
                <input value={name} onChange={(e) => title(e.target.value)} />
              </label>
              <label>
                人数上限
                <select value={cap} onChange={(e) => capacity(+e.target.value)}>
                  {[4, 5, 6, 7, 8].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              {btn("创建战队", async () => {
                await request(s, "/teams", "POST", { name, capacity: cap });
                await refresh(s);
              })}
              <label>
                邀请码
                <input value={code} onChange={(e) => invite(e.target.value)} />
              </label>
              {btn("加入战队", async () => {
                await request(s, "/teams/join", "POST", { code });
                await refresh(s);
              })}
            </>
          ) : (
            <>
              <h2>{guild.name}</h2>
              <p>
                邀请码 {guild.code} · 最多 {guild.capacity} 人
              </p>
              <label>
                打卡日期
                <input
                  type="date"
                  max={today()}
                  value={date}
                  onChange={(e) => {
                    day(e.target.value);
                    pictures({});
                    share([]);
                  }}
                />
              </label>
              <p>提交当天的饮食、体重和手环记录。默认队友只看到已打卡。</p>
              {photoSlots.map((k) => (
                <label key={date + k}>
                  {labels[k]}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.size <= 8 * 1024 * 1024)
                        pictures({ ...files, [k]: f });
                      else notice("图片须小于 8 MB");
                    }}
                  />
                </label>
              ))}
              <fieldset>
                <legend>对队友可见</legend>
                {Object.entries(labels).map(([k, v]) => (
                  <label key={k} style={{ display: "block" }}>
                    <input
                      type="checkbox"
                      checked={shares.includes(k)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        void run(async () => {
                          if (checked && !consent) {
                            if (
                              !confirm(
                                "健康信息共享授权\n所选照片、体重或手环数据将提供给本战队成员。可以随时撤回。是否同意？",
                              )
                            )
                              return;
                            await request(s, "/consent", "PUT", {
                              allow: true,
                            });
                            allow(true);
                          }
                          share(
                            checked
                              ? [...shares, k]
                              : shares.filter((x) => x !== k),
                          );
                        });
                      }}
                    />
                    {v}
                  </label>
                ))}
              </fieldset>
              {btn("保存打卡并同步", checkin)}
              {btn("同步并刷新动态", async () => {
                await flush(s);
                await refresh(s);
                notice("已同步");
              })}
              {consent &&
                btn("撤回全部共享", async () => {
                  await request(s, "/consent", "PUT", { allow: false });
                  for (const e of await pending(s))
                    await save({ ...e, data: { ...e.data, shares: [] } });
                  share([]);
                  await refresh(s);
                })}
              {boss && (
                <>
                  <p>
                    本周 BOSS 剩余 {boss.remaining.toFixed(1)} / {boss.hp}
                  </p>
                  {btn("结算本周 BOSS", async () => {
                    const r = await (
                      await request(s, `/boss/${boss.week}/settle`, "POST", {})
                    ).json();
                    notice(`本周奖励 ${r.coins} 金币`);
                    await refresh(s);
                  })}
                </>
              )}
              <h2>队友动态</h2>
              {feed.map((p) => (
                <article className="panel col" key={p.id}>
                  <strong>
                    {p.name} · {p.day} 已打卡
                  </strong>
                  {p.weight != null && <span>体重 {p.weight} kg</span>}
                  {p.band && (
                    <span>
                      步数 {p.band.steps ?? "—"} · 睡眠{" "}
                      {p.band.total_min ?? "—"} 分钟
                    </span>
                  )}
                  {Object.entries(p.photos).map(([k, id]) => (
                    <Media key={id + k} s={s} id={id} />
                  ))}
                  {btn(`点赞 ${p.likes}`, async () => {
                    await request(s, `/posts/${p.id}/like`, "PUT", {});
                    await refresh(s);
                  })}
                  {p.comments.map((c, i) => (
                    <p key={i}>
                      {c.name} · {c.body}
                    </p>
                  ))}
                  <label>
                    评论
                    <input
                      maxLength={500}
                      value={comments[p.id] ?? ""}
                      onChange={(e) =>
                        write({ ...comments, [p.id]: e.target.value })
                      }
                    />
                  </label>
                  {btn("发送评论", async () => {
                    await request(s, `/posts/${p.id}/comments`, "POST", {
                      body: comments[p.id],
                    });
                    write({ ...comments, [p.id]: "" });
                    await refresh(s);
                  })}
                </article>
              ))}
            </>
          )}
          {btn("导出我的战队数据和照片", exportAll)}
          {btn("删除我的战队账号与数据", async () => {
            if (!confirm("永久删除战队账号、打卡、照片、点赞和评论？")) return;
            await request(s, "/me", "DELETE");
            for (const e of await pending(s)) await remove(e);
            clear();
            notice("已删除战队数据");
          })}
          <button className="btn ghost" onClick={clear}>
            退出登录
          </button>
        </>
      )}
    </section>
  );
}
