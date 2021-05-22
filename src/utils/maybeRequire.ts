// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function maybeRequire(file: string): any | undefined {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(file);
  } catch (ex) {
    return undefined;
  }
}
