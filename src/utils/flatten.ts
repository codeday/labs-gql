export function flatten<T>(elements: T[][]): T[] {
  return elements.reduce((accum, e) => [...accum, ...e], []);
}
