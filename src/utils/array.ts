export function arrayFill<T>(length: number, value: T): T[] {
    if (length <= 0) return [];
    return Array.from({ length }, () => value);
}