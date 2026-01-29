import type { DataSourceRef, DataSourceType } from '../../domain/value-objects/data-source-ref.js';

/**
 * CloudWatch dimension values returned from Grafana's data source proxy
 */
export interface CloudWatchDimensionValues {
  readonly dimensionKey: string;
  readonly values: readonly string[];
  readonly region: string;
  readonly namespace: string;
}

/**
 * CloudWatch namespace health check result
 */
export interface CloudWatchNamespaceHealth {
  readonly namespace: string;
  readonly region: string;
  readonly hasMetrics: boolean;
  readonly metricCount: number;
}

export interface GrafanaFolder {
  readonly uid: string;
  readonly title: string;
  readonly url: string;
  readonly parentUid?: string;
}

export interface GrafanaContactPoint {
  readonly uid: string;
  readonly name: string;
  readonly type: string;
}

export interface GrafanaDataSource {
  readonly uid: string;
  readonly name: string;
  readonly type: string;
  readonly url?: string;
}

export interface GrafanaConnectionStatus {
  readonly connected: boolean;
  readonly version?: string;
  readonly error?: string;
}

export interface GrafanaPort {
  testConnection(): Promise<GrafanaConnectionStatus>;

  listFolders(): Promise<readonly GrafanaFolder[]>;

  getFolder(uid: string): Promise<GrafanaFolder | null>;

  listContactPoints(): Promise<readonly GrafanaContactPoint[]>;

  listDataSources(): Promise<readonly GrafanaDataSource[]>;

  getDataSourcesByType(type: DataSourceType): Promise<readonly GrafanaDataSource[]>;

  toDataSourceRef(dataSource: GrafanaDataSource): DataSourceRef;

  /**
   * Query CloudWatch dimension values through Grafana's data source proxy.
   * This validates that resources exist in CloudWatch for a given data source.
   */
  getCloudWatchDimensionValues(
    dataSourceUid: string,
    namespace: string,
    metricName: string,
    dimensionKey: string,
    region: string
  ): Promise<CloudWatchDimensionValues>;

  /**
   * Check if a CloudWatch namespace has any metrics in a region.
   * Used to distinguish between "no permissions" and "no activity".
   */
  checkCloudWatchNamespaceHealth(
    dataSourceUid: string,
    namespace: string,
    region: string
  ): Promise<CloudWatchNamespaceHealth>;
}
