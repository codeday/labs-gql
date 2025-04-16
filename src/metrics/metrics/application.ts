import config from "../../config";
import { metricGauge } from '../generators';

export default async function applicationMetric() {
    return metricGauge('version', 'application version', [{ labels: { version: config.version }, value: 1 }]);
}