import type { Attr, DayLog, MealSlot, Quest, State } from './types';
import { addDays, day, dayMut, latestWeight, setState, today } from './store';

// ---------- 数值 ----------
export const xpNeed = (level: number) => 100 + level * 50;
export const power = (s: State) => {
  const a = s.hero.attrs;
  const equip = Object.values(s.equipped).reduce((n, id) => n + (ITEMS[id]?.power ?? 0), 0);
  return Math.round((a.str + a.end + a.agi + a.wil) * 10 + s.hero.level * 50 + equip);
};

export const ATTR_LABEL: Record<Attr, string> = { str: '力量', end: '耐力', agi: '敏捷', wil: '意志' };

const questAttr = (q: Quest): Attr =>
  q.type === 'workout' ? 'str' : q.type === 'steps' ? 'end' : q.type === 'sleep' ? 'agi' : 'wil';

export const MEAL_LABEL: Record<MealSlot, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

// ---------- 装备 / 商店 ----------
export interface Item {
  id: string;
  name: string;
  slot: string;
  rarity: 'common' | 'rare' | 'epic' | 'legend';
  power: number;
  icon: string;
}
export const SLOTS = ['头盔', '护甲', '武器', '鞋子', '饰品', '宠物'];
export const ITEMS: Record<string, Item> = {
  wristguard: { id: 'wristguard', name: '铁质护腕', slot: '饰品', rarity: 'rare', power: 40, icon: 'dumbbell' },
  helm1: { id: 'helm1', name: '铁盔', slot: '头盔', rarity: 'common', power: 20, icon: 'helmet' },
  boots1: { id: 'boots1', name: '疾风跑鞋', slot: '鞋子', rarity: 'rare', power: 40, icon: 'boot' },
  sword1: { id: 'sword1', name: '燃脂之剑', slot: '武器', rarity: 'epic', power: 80, icon: 'sword' },
  armor1: { id: 'armor1', name: '自律胸甲', slot: '护甲', rarity: 'rare', power: 50, icon: 'helmet' },
  pet1: { id: 'pet1', name: '水滴精灵', slot: '宠物', rarity: 'epic', power: 60, icon: 'water' },
  moon1: { id: 'moon1', name: '安眠月坠', slot: '饰品', rarity: 'epic', power: 70, icon: 'moon' },
};
export const RARITY_LABEL = { common: '普通', rare: '稀有', epic: '史诗', legend: '传说' };
export const RARITY_COLOR = { common: 'var(--dim)', rare: 'var(--water)', epic: 'var(--xp)', legend: 'var(--accent)' };

export const SHOP = [
  { id: 'rest', name: '休息日券', desc: '一天不做运动任务也不断连续打卡', cost: 300, icon: 'scroll' },
  { id: 'cheat', name: '放纵餐券', desc: '一顿饭不计入热量考核', cost: 800, icon: 'meal' },
  { id: 'skin', name: '火焰骑士皮肤', desc: '角色换上火焰配色', cost: 1500, icon: 'knight' },
];

// ---------- 任务进度 ----------
export function questProgress(q: Quest, d: DayLog): number {
  if (q.type === 'water') return Number(d.water) || 0;
  const c = q.auto_check;
  if (c === 'steps') return d.health?.steps ?? 0;
  if (c === 'water') return Number(d.water) || 0;
  if (c === 'sleep') return d.health?.total_min ?? 0;
  if (c === 'record') return recordCount(d);
  if (c.startsWith('meal:')) {
    const slot = c.slice(5) as MealSlot | 'all';
    if (slot === 'all') {
      const total = Object.values(d.meals).reduce((n, m) => n + (m?.total_kcal ?? 0), 0);
      return Object.keys(d.meals).length >= 3 && total <= q.target ? q.target : 0;
    }
    const m = d.meals[slot];
    return m && m.total_kcal <= q.target ? q.target : 0;
  }
  return q.manualProgress ?? 0;
}

export const isManual = (q: Quest) => q.auto_check === 'manual';

/** 同一天同一种目标只能领一次奖：自动判定任务按判定来源，手动任务按类型 */
export const questKey = (q: Quest) => (q.type === 'water' ? 'water' : q.auto_check === 'manual' ? `manual:${q.type}` : q.auto_check);

/** 合并新计划的任务：保留已领取的，丢掉与已领取任务同目标的新任务（防止重新生成后重复领奖） */
export function mergeQuests(old: Quest[], fresh: Quest[]): Quest[] {
  const kept = old.filter((q) => q.claimed);
  const used = new Set(kept.map(questKey));
  const out = [...kept];
  for (const q of fresh) {
    const k = questKey(q);
    if (used.has(k)) continue;
    used.add(k);
    out.push(q);
  }
  return out;
}

export function recordCount(d: DayLog) {
  return Object.keys(d.meals).length + (d.health ? 1 : 0) + (d.weight ? 1 : 0);
}

export interface RewardResult {
  title: string;
  power: number;
  xp: number;
  coins: number;
  drop?: Item;
  levelUp?: number;
  level: number;
  xpPct: number;
}

function grant(s: State, p: number, coins: number, attr: Attr, dropChance = 0): RewardResult {
  const xp = Math.round(p * 0.6) + 5;
  s.hero.attrs[attr] = +(s.hero.attrs[attr] + p / 10).toFixed(1);
  s.hero.coins += coins;
  s.hero.xp += xp;
  let levelUp: number | undefined;
  while (s.hero.xp >= xpNeed(s.hero.level)) {
    s.hero.xp -= xpNeed(s.hero.level);
    s.hero.level++;
    levelUp = s.hero.level;
  }
  let drop: Item | undefined;
  if (Math.random() < dropChance) {
    const pool = Object.values(ITEMS).filter((i) => !s.inventory.includes(i.id));
    if (pool.length) {
      drop = pool[Math.floor(Math.random() * pool.length)];
      s.inventory.push(drop.id);
      if (!s.equipped[drop.slot]) s.equipped[drop.slot] = drop.id;
    }
  }
  // 连续打卡
  const t = today();
  if (s.hero.lastActive !== t) {
    s.hero.streak = s.hero.lastActive === addDays(t, -1) ? s.hero.streak + 1 : 1;
    s.hero.lastActive = t;
  }
  s.hero.title = titleFor(s);
  return { title: '', power: p, xp, coins, drop, levelUp, level: s.hero.level, xpPct: Math.round((s.hero.xp / xpNeed(s.hero.level)) * 100) };
}

function titleFor(s: State) {
  const st = s.hero.streak;
  if (st >= 30) return '钢铁意志';
  if (st >= 14) return '自律新星';
  if (st >= 7) return '坚持者';
  if (s.hero.level >= 5) return '见习骑士';
  return '新手勇者';
}

export function claimQuest(id: string): RewardResult | null {
  let res: RewardResult | null = null;
  setState((s) => {
    const d = dayMut(s);
    const q = d.quests.find((x) => x.id === id);
    if (!q || q.claimed || questProgress(q, d) < q.target) return;
    if (d.quests.some((o) => o !== q && o.claimed && questKey(o) === questKey(q))) return;
    q.claimed = true;
    res = grant(s, q.reward_power, q.reward_coin, questAttr(q), 0.15 + q.difficulty * 0.1);
    res.title = q.title;
  });
  return res;
}

export function smallReward(title: string, p: number, coins: number, attr: Attr): RewardResult {
  let res!: RewardResult;
  setState((s) => {
    res = grant(s, p, coins, attr, 0);
    res.title = title;
  });
  return res;
}

export function openDailyChest(): { coins: number; gems: number; drop?: Item } | null {
  let out: { coins: number; gems: number; drop?: Item } | null = null;
  setState((s) => {
    const d = dayMut(s);
    if (d.chestOpened || !d.quests.some((q) => q.claimed)) return;
    d.chestOpened = true;
    const coins = 20 + Math.floor(Math.random() * 41);
    const gems = Math.random() < 0.3 ? 1 : 0;
    s.hero.coins += coins;
    s.hero.gems += gems;
    let drop: Item | undefined;
    if (Math.random() < 0.2) {
      const pool = Object.values(ITEMS).filter((i) => !s.inventory.includes(i.id));
      if (pool.length) {
        drop = pool[Math.floor(Math.random() * pool.length)];
        s.inventory.push(drop.id);
        if (!s.equipped[drop.slot]) s.equipped[drop.slot] = drop.id;
      }
    }
    out = { coins, gems, drop };
  });
  return out;
}

export function bossCheckIn(): RewardResult | null {
  let res: RewardResult | null = null;
  setState((s) => {
    const d = dayMut(s);
    if (!s.boss || s.boss.done || d.bossChecked) return;
    d.bossChecked = true;
    s.boss.progress++;
    if (s.boss.progress >= s.boss.days) {
      s.boss.done = true;
      s.hero.gems += 5;
      res = grant(s, 150, 300, 'wil', 1);
      res.title = `击败 BOSS：${s.boss.name}（传说宝箱）`;
    } else {
      res = grant(s, 10, 5, 'wil', 0);
      res.title = `BOSS 挑战 ${s.boss.progress}/${s.boss.days}`;
    }
  });
  return res;
}

// ---------- 成就 ----------
export function badges(s: State) {
  const days = Object.values(s.days);
  const lost = (s.profile?.startWeight ?? 0) - latestWeight(s);
  const maxSteps = Math.max(0, ...days.map((d) => d.health?.steps ?? 0));
  const waterDays = days.filter((d) => d.water >= 8).length;
  const claimed = days.reduce((n, d) => n + d.quests.filter((q) => q.claimed).length, 0);
  return [
    { name: '初次出征', icon: 'sword', ok: claimed >= 1 },
    { name: '减重2kg', icon: 'scale', ok: lost >= 2 },
    { name: '减重5kg', icon: 'scale', ok: lost >= 5 },
    { name: '七日连胜', icon: 'bolt', ok: s.hero.streak >= 7 },
    { name: '万步行者', icon: 'boot', ok: maxSteps >= 10000 },
    { name: '饮水大师', icon: 'water', ok: waterDays >= 7 },
    { name: '任务达人', icon: 'star', ok: claimed >= 30 },
    { name: '屠魔者', icon: 'skull', ok: !!s.boss?.done },
  ];
}

export function sleepEffect(d: DayLog) {
  const m = d.health?.total_min;
  if (m == null) return null;
  if (m < 420) return { name: '疲惫', good: false, text: `睡眠不足 7 小时，今日任务强度 -20%` };
  return { name: '精力充沛', good: true, text: '睡眠充足，今日战力获取 +10%' };
}

export const todayTotals = (s: State) => {
  const d = day(s);
  const ms = Object.values(d.meals);
  return {
    kcal: ms.reduce((n, m) => n + (m?.total_kcal ?? 0), 0),
    target: d.plan?.targets.intake_kcal ?? defaultIntake(s),
  };
};

export function bmr(s: State) {
  const p = s.profile;
  if (!p) return 1500;
  const w = latestWeight(s);
  return Math.round(10 * w + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161));
}

export function defaultIntake(s: State) {
  const floor = s.profile?.sex === 'female' ? 1200 : 1500;
  return Math.max(floor, bmr(s), Math.round((bmr(s) * 1.35 - 450) / 50) * 50);
}
