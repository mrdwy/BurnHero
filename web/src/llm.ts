import type { BodyMetrics, FoodItem, HealthData, MealSlot, Plan, State, Conf } from './types';
import { MEAL_LABEL, bmr, defaultIntake } from './game';
import { addDays, day, latestAssessment, latestWeight, today, weekday } from './store';
import { apiReady, BODY_FIELDS } from './validate';

// ============ 大模型指令（与 design/AI_INTERACTION.md 保持一致） ============

const MEAL_SYSTEM = `你是一名注册营养师，负责估算中国家常饮食的热量和营养。
规则：
1. 根据图片和用户描述识别每种食物，估算份量（克）和热量（kcal）。用户描述与图片冲突时，以用户描述的份量为准。
2. 份量不确定时，按中国成年人常见的一份估算，并把 confidence 设为 "low"。
3. 只输出 JSON，不要输出任何其他文字。格式：
{"items":[{"name":"","portion":"","grams":0,"kcal":0,"protein_g":0,"carb_g":0,"fat_g":0,"confidence":"high|low"}],"total_kcal":0,"protein_g":0,"carb_g":0,"fat_g":0,"comment":""}
4. comment 是给用户的一句话点评（≤30 字），语气像游戏里的贤者导师，鼓励为主，给一个具体可执行的建议。`;

const SHOT_SYSTEM = `你是数据录入助手，从手机健康类 App（手环、手表、运动 App）的截图中提取数据。
规则：
1. 只提取截图里明确显示的数字，绝不推算或编造。看不到的字段 value 填 null。
2. 时长统一换算成分钟，时间用 24 小时制 "HH:MM"，日期用 "YYYY-MM-DD"。
3. 截图日期看不出来时，date 填 null。
4. 每个字段给出 confidence：数字清晰可读为 "high"，模糊、被遮挡或需要从图表估读为 "low"。
5. 多张截图合并成一个结果；同一字段在多张图里出现时取最清晰的那个。
6. 只输出 JSON，格式：
{"date":null,"activity":{"steps":{"value":null,"confidence":"high"},"active_kcal":{...},"distance_km":{...},"avg_heart_rate":{...},"exercise_min":{...}},
 "sleep":{"bed_time":{...},"wake_time":{...},"total_min":{...},"deep_min":{...},"light_min":{...},"rem_min":{...},"awake_min":{...},"score":{...}}}`;

// ============ 调用 ============

type Content = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

async function chatRaw(s: State, system: string, user: Content): Promise<string> {
  if (!apiReady(s.llm)) throw new Error('请先填写 API 地址、Key 和模型');
  const { baseUrl, apiKey, model } = s.llm;
  const payload = { model, temperature: 0.4, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = sessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch('/api/llm', {
    method: 'POST',
    headers,
    body: JSON.stringify({ baseUrl, apiKey, payload }),
    signal: AbortSignal.timeout(180000),
  });
  const text = await r.text();
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`接口返回不是 JSON（HTTP ${r.status}）：${text.slice(0, 120)}`);
  }
  if (!r.ok || j.error) throw new Error(llmError(r.status, j));
  const content: string = j.choices?.[0]?.message?.content ?? '';
  return content;
}

// 线上服务的转发接口要求登录；本地便携版没有账号服务，不带 token 也能用。
function sessionToken(): string | undefined {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const token = JSON.parse(store.getItem('guild-session') || 'null')?.token;
      if (typeof token === 'string' && token) return token;
    } catch {}
  }
  return undefined;
}

// 区分“本服务的问题”和“模型服务的问题”，不要一律让用户去查 Key。
export function llmError(status: number, j: any): string {
  if (status === 401 && typeof j?.error === 'string') {
    // 本服务的登录失效：清掉会话并通知界面回到登录页。
    try {
      localStorage.removeItem('guild-session');
      sessionStorage.removeItem('guild-session');
      window.dispatchEvent(new Event('burnhero-session'));
    } catch {}
    return '登录已失效，请重新登录后再识别';
  }
  if (typeof j?.error === 'string') return `AI 转发失败（HTTP ${status}）：${j.error}`;
  if (status === 404 && typeof j?.message === 'string' && j.message.startsWith('Route')) return '服务器缺少 AI 转发接口（HTTP 404），请联系管理员更新服务';
  const upstream = typeof j?.error?.message === 'string' ? `：${j.error.message.slice(0, 120)}` : '';
  if (status === 401 || status === 403) return `模型服务拒绝了请求（HTTP ${status}），请检查 API Key${upstream}`;
  if (status === 404) return `模型服务返回 404，请检查 API 地址是否需要带 /v1，以及模型名是否正确${upstream}`;
  if (status === 429) return `模型服务限流或余额不足（HTTP 429）${upstream}`;
  return `模型请求失败（HTTP ${status}），请检查地址、Key、模型及服务可用性${upstream}`;
}

async function chat(s: State, system: string, user: Content): Promise<any> {
  return parseJson(await chatRaw(s, system, user));
}

export function parseJson(t: string) {
  const s = t.replace(/```(json)?/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('模型没有返回 JSON：' + s.slice(0, 80));
  return JSON.parse(s.slice(a, b + 1));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    return await fn();
  }
}

// 模型返回的日期五花八门（2026/5/28 22:12、2026-05-28T22:12），统一成 YYYY-MM-DD，认不出就 null。
export function normalizeDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 上传前压缩：长截图原图常有 0.5～1MB。宽度限制 1080、JPEG 0.85，数字仍清晰，请求更小更稳。
export async function shrinkImage(dataUrl: string, maxWidth = 1080, maxPixels = 6_000_000): Promise<string> {
  if (typeof document === 'undefined' || !dataUrl.startsWith('data:image/')) return dataUrl;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const scale = Math.min(1, maxWidth / img.naturalWidth, Math.sqrt(maxPixels / (img.naturalWidth * img.naturalHeight)));
    if (scale >= 1 && dataUrl.length < 700_000) return dataUrl;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.85);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

const NO_IMAGE = '模型没有读出任何指标，可能没收到图片（服务不稳定或该模型不支持看图）。请重试，或换一个支持图片识别的模型。';

export interface BodyPhotoResult {
  measuredDate: string | null;
  metrics: BodyMetrics;
  rawResponse: string;
}

// 旧提示词允许模型“自然语言回复”，结果常常抽不出数值。改为严格 JSON，并要求 value/confidence。
const BODY_SYSTEM = '从体脂秤App报告截图提取明确显示的数值，不推算、不编造；只输出JSON：{"measured_date":"YYYY-MM-DD或null","metrics":{"weight_kg":{"value":null,"confidence":"high|low"},"body_fat_pct":null,"muscle_kg":null,"visceral_fat":null,"bmr_kcal":null,"bmi":null}}。每项已识别指标使用value/confidence对象，value只填数字不带单位；缺失字段填null。muscle_kg取骨骼肌量。';

export async function recognizeBodyPhoto(state: State, image: string, details?: { condition: string; sleep: string; availableMinutes: string }): Promise<BodyPhotoResult> {
  const url = await shrinkImage(image);
  const read = (parsed: any) => {
    const metrics: BodyMetrics = {};
    for (const field of BODY_FIELDS) {
      const raw = parsed?.metrics?.[field.key];
      const value = num(raw && typeof raw === 'object' ? raw.value : raw);
      if (value != null) metrics[field.key] = value;
    }
    return metrics;
  };
  const rawResponse = await withRetry(async () => {
    const response = await chatRaw(state, BODY_SYSTEM, [
      { type: 'text', text: '请读取这张报告截图。用户补充：' + JSON.stringify(details ?? {}) },
      { type: 'image_url', image_url: { url } },
    ]);
    let parsed: any;
    try { parsed = parseJson(response); } catch { throw new Error(NO_IMAGE); }
    if (!Object.keys(read(parsed)).length) throw new Error(NO_IMAGE);
    return response;
  });
  const parsed = parseJson(rawResponse);
  return { measuredDate: normalizeDate(parsed?.measured_date), metrics: read(parsed), rawResponse };
}

// ---------- ① 餐饮识别 ----------
export interface MealResult {
  items: FoodItem[];
  total_kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  comment: string;
}

export async function recognizeMeal(s: State, slot: MealSlot, text: string, image?: string): Promise<MealResult> {
  const eaten = Object.values(day(s).meals).reduce((n, m) => n + (m?.total_kcal ?? 0), 0);
  const prompt = `餐次：${MEAL_LABEL[slot]}\n用户描述：${text || '（无，仅看图片）'}\n今日已摄入：${eaten} kcal，今日目标：${day(s).plan?.targets.intake_kcal ?? defaultIntake(s)} kcal`;
  const content: Content = image ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: await shrinkImage(image) } }] : prompt;
  const r = await withRetry(() => chat(s, MEAL_SYSTEM, content));
  return normalizeMeal(r);
}

function normalizeMeal(r: any): MealResult {
  const items: FoodItem[] = (r.items ?? []).map((i: any) => ({
    name: String(i.name ?? '未知'), portion: String(i.portion ?? ''), grams: num(i.grams), kcal: num(i.kcal) ?? 0,
    protein_g: num(i.protein_g), carb_g: num(i.carb_g), fat_g: num(i.fat_g), confidence: i.confidence === 'low' ? 'low' : 'high',
  }));
  const sum = (k: keyof FoodItem) => Math.round(items.reduce((n, i) => n + ((i[k] as number) ?? 0), 0));
  return {
    items,
    total_kcal: sum('kcal'),
    protein_g: num(r.protein_g) ?? sum('protein_g'),
    carb_g: num(r.carb_g) ?? sum('carb_g'),
    fat_g: num(r.fat_g) ?? sum('fat_g'),
    comment: String(r.comment ?? ''),
  };
}

const num = (v: any): number | undefined => (v == null || v === '' || !Number.isFinite(+v) ? undefined : +v);

// ---------- ② 截图识别 ----------
export type HealthFields = Record<keyof Omit<HealthData, 'importedAt'>, { value: any; confidence: Conf }>;

export async function recognizeScreenshots(s: State, images: string[]): Promise<{ date: string | null; fields: Partial<HealthFields> }> {
  if (!images.length) throw new Error('请先上传截图');
  const content: Content = [
    { type: 'text', text: `请识别这些截图。今天是 ${today()}。` },
    ...(await Promise.all(images.map(async (url) => ({ type: 'image_url' as const, image_url: { url: await shrinkImage(url) } })))),
  ];
  const r = await withRetry(() => chat(s, SHOT_SYSTEM, content));
  const fields: any = {};
  for (const grp of [r.activity ?? {}, r.sleep ?? {}]) {
    for (const [k, v] of Object.entries<any>(grp)) {
      if (v && typeof v === 'object' && 'value' in v) fields[k] = { value: v.value, confidence: v.confidence === 'low' ? 'low' : 'high' };
      else if (v != null) fields[k] = { value: v, confidence: 'high' };
    }
  }
  return { date: normalizeDate(r.date), fields };
}

// ---------- ③ 每日计划 ----------
export async function generatePlan(s: State, note: string): Promise<Plan> {
  if (!apiReady(s.llm)) throw new Error('请先填写 API 地址、Key 和模型');
  const assessment = latestAssessment(s);
  const t = today();
  const y = day(s, addDays(t, -1));
  const td = day(s, t);
  const p = s.profile!;
  const weights: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const w = s.days[addDays(t, -i)]?.weight;
    if (w) weights.push(w);
  }
  const body = {
    date: t,
    weekday: weekday(t),
    profile: { sex: p.sex, age: p.age, height_cm: p.height, weight_kg: latestWeight(s), target_kg: p.targetWeight, class: clsLabel(p.cls), workout_days_per_week: p.workoutDays, bmr: bmr(s) },
    body_assessment: {
      measured_date: assessment?.measuredDate,
      metrics: assessment?.metrics,
      report_reply: assessment?.reportResponse,
      condition: assessment?.condition,
      sleep_hours: assessment?.sleepHours,
      available_exercise_minutes: assessment?.availableMinutes,
    },
    yesterday: {
      intake_kcal: Object.values(y.meals).reduce((n, m) => n + (m?.total_kcal ?? 0), 0) || null,
      target_kcal: y.plan?.targets.intake_kcal ?? null,
      steps: y.health?.steps ?? null,
      quests_done: y.quests.filter((q) => q.claimed).length,
      quests_total: y.quests.length,
      missed: y.quests.filter((q) => !q.claimed).map((q) => q.title),
    },
    last_night_sleep: td.health?.total_min != null ? { minutes: td.health.total_min, score: td.health.score ?? null } : null,
    weight_trend_7d: weights,
    streak_days: s.hero.streak,
    current_boss: s.boss && !s.boss.done ? { name: s.boss.name, progress: `${s.boss.progress}/${s.boss.days}` } : null,
    user_note: note || '',
  };
  const rawResponse = await chatRaw(s, '根据用户提供的报告内容、身体状况和目标，给出个性化建议与今日计划。应用不会审核输入或输出。可直接自然语言回复；如需同步游戏任务，也可使用以下 JSON 结构，但不是必需：{"coach_message":"","targets":{"intake_kcal":0,"burn_kcal":0,"water_cups":0,"difficulty":1},"timeline":[{"time":"","type":"","text":""}],"quests":[{"title":"","type":"steps|water|meal|workout|sleep|record","target":0,"unit":"","difficulty":1,"reward_power":0,"reward_coin":0,"auto_check":"manual"}]}', JSON.stringify(body));
  let parsed: any;
  try { parsed = parseJson(rawResponse); } catch { parsed = {}; }
  return { ...normalizePlan(parsed), rawResponse, assessmentId: assessment?.id };
}

function normalizePlan(result: any): Plan {
  const targets = result?.targets ?? {};
  return {
    coach_message: String(result?.coach_message ?? ''),
    targets: {
      intake_kcal: num(targets.intake_kcal) ?? 0,
      burn_kcal: num(targets.burn_kcal) ?? 0,
      water_cups: num(targets.water_cups) ?? 0,
      difficulty: num(targets.difficulty) ?? 0,
    },
    timeline: (Array.isArray(result?.timeline) ? result.timeline : []).map((item: any) => ({
      time: String(item?.time ?? ''), text: String(item?.text ?? ''), type: String(item?.type ?? ''), kcal: num(item?.kcal),
    })),
    quests: (Array.isArray(result?.quests) ? result.quests : []).map((quest: any, index: number) => ({
      id: 'llm-' + Date.now() + '-' + index, title: String(quest?.title ?? ''),
      type: quest?.type ?? 'record', target: num(quest?.target) ?? 0, unit: String(quest?.unit ?? ''),
      difficulty: num(quest?.difficulty) ?? 0, reward_power: num(quest?.reward_power) ?? 0,
      reward_coin: num(quest?.reward_coin) ?? 0, auto_check: String(quest?.auto_check ?? 'manual'),
    })),
    boss: result?.boss?.name ? { name: String(result.boss.name), desc: String(result.boss.desc ?? ''), days: num(result.boss.days) ?? 7 } : null,
  };
}

export const clsLabel = (c: string) => ({ warrior: '战士', ranger: '游侠', monk: '武僧' } as any)[c] ?? c;

