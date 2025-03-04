export function maxFunction<T>(array: T[], fn: (item: T) => number): T | undefined {
    let maxVal = -Infinity;
    let maxItem = array[0];
    for (const item of array.slice(1)) {
        const val = fn(item);
        if (val > maxVal) {
            maxVal = val;
            maxItem = item;
        }
    }
    return maxItem;
}

export function minFunction<T>(array: T[], fn: (item: T) => number): T | undefined {
    let minVal = -Infinity;
    let minItem = array[0];
    for (const item of array.slice(1)) {
        const val = fn(item);
        if (val < minVal) {
            minVal = val;
            minItem = item;
        }
    }
    return minItem;
}