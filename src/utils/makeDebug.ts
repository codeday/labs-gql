import debug from 'debug';

export function makeDebug(key: string): debug.Debugger {
  return debug(`codeday:labs:${key}`);
}