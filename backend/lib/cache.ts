type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();

export const cacheGet = <T>(key: string): T | null => {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
};

export const cacheSet = <T>(key: string, value: T, ttlMs = 30000) => {
  store.set(key, { value, expires: Date.now() + ttlMs });
};

export const cacheClear = (prefix?: string) => {
  if (!prefix) {
    store.clear();
    return;
  }
  Array.from(store.keys()).forEach(key => {
    if (key.startsWith(prefix)) store.delete(key);
  });
};
