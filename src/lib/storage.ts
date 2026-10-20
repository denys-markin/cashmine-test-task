// Browser storage that never throws: localStorage can be missing or blocked (private mode, quotas).

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readItem(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    // Not persisted; the app keeps working for this session.
  }
}

export function removeItem(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {}
}

export function readJson<T>(key: string): T | null {
  const raw = readItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeItem(key, JSON.stringify(value));
}

export function removeByPrefix(prefix: string): void {
  const s = store();
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => s.removeItem(key));
  } catch {}
}
