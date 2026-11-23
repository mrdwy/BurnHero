import { useSyncExternalStore } from 'react';
import type { DayLog, State } from './types';

const KEY = 'fat-burn-hero/v1';

export const initialState = (): State => ({
  version: 1,
  profile: null,
  llm: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', demo: false },
  hero: { level: 1, xp: 0, coins: 100, gems: 0, attrs: { str: 5, end: 5, agi: 5, wil: 5 }, streak: 0, title: '新手勇者' },
  days: {},
  inventory: [],
  equipped: {},
  tickets: {},
});

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initialState(), ...JSON.parse(raw) };
  } catch {}
  return initialState();
}

let state: State = load();
const subs = new Set<() => void>();

export function getState() {
  return state;
}

export function setState(fn: (s: State) => State | void) {
  const draft = structuredClone(state);
  const r = fn(draft);
  state = r ?? draft;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  subs.forEach((f) => f());
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => sel(state)
  );
}

export function resetAll() {
  state = initialState();
  localStorage.removeItem(KEY);
  subs.forEach((f) => f());
}

// ---------- 日期工具 ----------
export const dateKey = (d = new Date()) => {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const today = () => dateKey();
export const addDays = (k: string, n: number) => {
  const d = new Date(k + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
export const weekday = (k: string) => '周' + '日一二三四五六'[new Date(k + 'T12:00:00').getDay()];

export const emptyDay = (): DayLog => ({ meals: {}, water: 0, quests: [] });

export function day(s: State, k = today()): DayLog {
  return s.days[k] ?? emptyDay();
}

export function latestAssessment(state: State) {
  return Object.keys(state.days).sort().reverse().map((key) => state.days[key].bodyAssessment).find((assessment) => assessment != null);
}

/** 在 setState 里取当天记录（不存在就创建） */
export function dayMut(s: State, k = today()): DayLog {
  if (!s.days[k]) s.days[k] = emptyDay();
  return s.days[k];
}

export function latestWeight(s: State): number {
  const keys = Object.keys(s.days).sort().reverse();
  for (const k of keys) if (s.days[k].weight) return s.days[k].weight!;
  return s.profile?.startWeight ?? 0;
}

export function previousWeight(s: State, before = today()): number | undefined {
  const keys = Object.keys(s.days).filter((k) => k < before).sort().reverse();
  for (const k of keys) if (s.days[k].weight) return s.days[k].weight!;
  return s.profile?.startWeight;
}
