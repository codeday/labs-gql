export function sum(...values: number[]) {
    return values.reduce((acc, value) => acc + value, 0);
}

export function average(...values: number[]) {
    return sum(...values) / values.length;
}

