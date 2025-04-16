import metrics from './metrics';

export async function getPrometheusMetrics() {
    return (await Promise.all(metrics.map((metric) => metric()))).join('\n');
}