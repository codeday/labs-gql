export function ttlCache<T>(ttlMs: number, compute: () => Promise<T>): () => Promise<T> {
  let cached: { value: T; expiresAt: number } | null = null;

  return async (): Promise<T> => {
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await compute();
    cached = { value, expiresAt: Date.now() + ttlMs };
    return value;
  };
}
