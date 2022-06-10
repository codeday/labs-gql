const isObj = (x: any) => typeof x === 'object';

export function deepIntersection<TA, TB>(a: TA, b: TB): Partial<TA> {
  if (![a, b].every(isObj)) return {};

  const result: Partial<TA> = {};

  Object.keys(a).forEach((key) => {
    // @ts-ignore
    if (key in a && key in b && isObj(b[key])) { // b specifies a subobject of keys to include
      // @ts-ignore
      result[key] = deepIntersection(a[key], b[key]);
    // @ts-ignore
    } else if (key in a && key in b && b[key]) { // b allows everything in the key to be included
      // @ts-ignore
      result[key] = a[key];
    }
  });

  return result;
}

export function deepKvFilter<T extends Record<string, unknown>>(
  obj: T,
  filter: (key: string, el: unknown) => boolean,
): Partial<T> {
  if (!isObj(obj)) return {};

  const result: Partial<T> = {};
  Object.keys(obj).forEach((key) => {
    const val = obj[key];
    if (isObj(val)) {
      // @ts-ignore
      result[key] = deepKvFilter(val as Record<string, unknown>, filter);
    } else if (filter(key, val)) {
      // @ts-ignore
      result[key] = val;
    }
  });

  return result;
}
