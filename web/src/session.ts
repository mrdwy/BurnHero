import { useSyncExternalStore } from 'react';
import type { Session } from './guildClient';

// 账号登录状态。存 localStorage，关掉页面后仍保持登录；旧版存在 sessionStorage 的会话自动迁移。
const KEY = 'guild-session';
const listeners = new Set<() => void>();
let cached: { raw: string | null | undefined; value: Session | null } = { raw: undefined, value: null };

function readRaw(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return raw;
    const old = sessionStorage.getItem(KEY);
    if (old) {
      localStorage.setItem(KEY, old);
      sessionStorage.removeItem(KEY);
    }
    return old;
  } catch {
    return null;
  }
}

export function readSession(): Session | null {
  const raw = readRaw();
  if (raw === cached.raw) return cached.value;
  let value: Session | null = null;
  try {
    const parsed = JSON.parse(raw || 'null');
    if (parsed && typeof parsed.token === 'string' && parsed.token && typeof parsed.origin === 'string') value = parsed;
  } catch {}
  cached = { raw, value };
  return value;
}

const emit = () => listeners.forEach((fn) => fn());

export function saveSession(s: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
  emit();
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem('guild-team');
  } catch {}
  emit();
}

export function useSession() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      const onStorage = (e: StorageEvent) => e.key === KEY && fn();
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(fn);
        window.removeEventListener('storage', onStorage);
      };
    },
    readSession,
  );
}
