import { clearSession } from "./session";
export type Session = { origin: string; id: string; token: string };
export type Entry = {
  key: string;
  owner: string;
  day: string;
  data: Record<string, unknown>;
  files: Record<string, File>;
  revision: string;
};
export const group = (s: Session) => `${s.origin}|${s.id}`;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("burnhero-guild-queue", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("entries", { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("entries", mode);
    const req = work(tx.objectStore("entries"));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export const save = (e: Entry) => transact("readwrite", (s) => s.put(e));
export const pending = async (s: Session) =>
  ((await transact("readonly", (o) => o.getAll())) as Entry[]).filter(
    (e) => e.owner === group(s),
  );
export async function remove(e: Entry) {
  const db = await database();
  await new Promise<void>((ok, no) => {
    const tx = db.transaction("entries", "readwrite");
    const store = tx.objectStore("entries");
    const req = store.get(e.key);
    req.onsuccess = () => {
      if (req.result?.revision === e.revision) store.delete(e.key);
    };
    tx.oncomplete = () => {
      db.close();
      ok();
    };
    tx.onabort = () => {
      db.close();
      no(tx.error);
    };
  });
}
export async function request(
  s: Session,
  path: string,
  method = "GET",
  data?: unknown,
) {
  const headers: Record<string, string> = {};
  if (s.token) headers.Authorization = `Bearer ${s.token}`;
  if (data !== undefined)
    headers["Content-Type"] =
      data instanceof Blob ? data.type : "application/json";
  const res = await fetch(s.origin + "/api" + path, {
    method,
    headers,
    body:
      data === undefined
        ? undefined
        : data instanceof Blob
          ? data
          : JSON.stringify(data),
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  });
  if (res.status === 401 && s.token) {
    clearSession();
    throw Error("登录已失效，请重新登录");
  }
  if (!res.ok)
    throw Error(
      (await res.json().catch(() => ({}))).error ?? `请求失败 (${res.status})`,
    );
  return res;
}
const active = new Map<string, Promise<number>>();
export function flush(s: Session) {
  const owner = group(s),
    current = active.get(owner);
  if (current) return current;
  const sending = (async () => {
    const entries = await pending(s);
    for (const e of entries) {
      await request(s, `/days/${e.day}`, "PUT", e.data);
      for (const [slot, file] of Object.entries(e.files))
        await request(s, `/days/${e.day}/photos/${slot}`, "PUT", file);
      await remove(e);
    }
    return entries.length;
  })().finally(() => active.delete(owner));
  active.set(owner, sending);
  return sending;
}
