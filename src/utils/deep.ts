const isObj = (x: any) => typeof x === 'object';

export function deepIntersection<TA, TB>(a: TA, b: TB): Partial<TA> {
  if (![a, b].every(isObj)) return {};

  const result: Partial<TA> = {};

  Object.keys(a).forEach((key) => {
    if (key in a && key in b && isObj(b[key])) { // b specifies a subobject of keys to include
      result[key] = deepIntersection(a[key], b[key]);
    } else if (key in a && key in b && b[key]) { // b allows everything in the key to be included
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
      result[key] = deepKvFilter(val as Record<string, unknown>, filter);
    } else if (filter(key, val)) {
      result[key] = val;
    }
  });

  return result;
}
