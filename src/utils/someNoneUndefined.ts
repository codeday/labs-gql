// eslint-disable-next-line @typescript-eslint/ban-types
export function someNoneUndefined(value: boolean | undefined | null): { some: {} } | { none: {} } | undefined {
  if (value === null || typeof value === 'undefined') return undefined;
  return value ? { some: {} } : { none: {} };
}
