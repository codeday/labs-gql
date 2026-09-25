export function ttlCache<T>(ttlMs: number, compute: () => Promise<T>): () => Promise<T> {
  let cached: { value: T; expiresAt: number } | null = null;
  let pending: Promise<T> | null = null;

  return async (): Promise<T> => {
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (pending) return pending;
    pending = compute()
      .then((value) => {
        cached = { value, expiresAt: Date.now() + ttlMs };
        return value;
      })
      .finally(() => { pending = null; });
    return pending;
  };
}
