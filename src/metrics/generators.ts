export type MetricLabels = { labels: Record<string, string>, value: number };

export function metricGauge(name: string, help: string, values: MetricLabels[]): string {
    return `# TYPE labs_${name} gauge\n`
        + `# HELP labs_${name} ${help}\n`
        + values.map(
            ({ labels, value }) => `labs_${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}} ${value}\n`
        ).join('');
}