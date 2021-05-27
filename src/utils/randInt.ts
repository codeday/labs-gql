// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
export function randInt(min: number, max: number): number {
  const minC = Math.ceil(min);
  const maxF = Math.floor(max);
  return Math.floor(Math.random() * (maxF - minC) + minC); // The maximum is exclusive and the minimum is inclusive
}
