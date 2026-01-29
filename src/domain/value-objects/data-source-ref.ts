export type DataSourceType = 'cloudwatch' | 'prometheus';

export interface CloudWatchDataSourceConfig {
  readonly type: 'cloudwatch';
  readonly namespace: string;
  readonly metric: string;
  readonly statistic: 'Average' | 'Sum' | 'Minimum' | 'Maximum' | 'SampleCount' | 'p50' | 'p90' | 'p95' | 'p99';
  readonly dimensions: readonly string[];
  readonly period?: number;
}

export interface PrometheusDataSourceConfig {
  readonly type: 'prometheus';
  readonly metric: string;
  readonly query: string;
}

export type DataSourceConfig = CloudWatchDataSourceConfig | PrometheusDataSourceConfig;

export interface DataSourceRef {
  readonly uid: string;
  readonly type: DataSourceType;
  readonly name: string;
}

export function createDataSourceRef(
  uid: string,
  type: DataSourceType,
  name: string
): DataSourceRef {
  return Object.freeze({ uid, type, name });
}

export function isCloudWatchConfig(config: DataSourceConfig): config is CloudWatchDataSourceConfig {
  return config.type === 'cloudwatch';
}

export function isPrometheusConfig(config: DataSourceConfig): config is PrometheusDataSourceConfig {
  return config.type === 'prometheus';
}
