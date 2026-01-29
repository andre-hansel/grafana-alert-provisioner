import type {
  GrafanaPort,
  GrafanaFolder,
  GrafanaContactPoint,
  GrafanaDataSource,
  GrafanaConnectionStatus,
  CloudWatchDimensionValues,
  CloudWatchNamespaceHealth,
} from '../../../ports/outbound/grafana-port.js';
import type { DataSourceRef, DataSourceType } from '../../../domain/value-objects/data-source-ref.js';

interface GrafanaConfig {
  url: string;
  apiKey?: string;
}

interface GrafanaHealthResponse {
  database: string;
  version: string;
}

interface GrafanaFolderResponse {
  uid: string;
  title: string;
  url: string;
  parentUid?: string;
}

interface GrafanaSearchFolderResponse {
  uid: string;
  title: string;
  url: string;
  folderUid?: string;
  folderTitle?: string;
  type: string;
}

interface GrafanaContactPointResponse {
  uid: string;
  name: string;
  type: string;
}

interface GrafanaDataSourceResponse {
  uid: string;
  name: string;
  type: string;
  url?: string;
}

export class GrafanaApiAdapter implements GrafanaPort {
  private config: GrafanaConfig;

  constructor(config: GrafanaConfig) {
    this.config = config;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.url}/api${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Grafana API error: ${response.status} - ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async testConnection(): Promise<GrafanaConnectionStatus> {
    try {
      const health = await this.request<GrafanaHealthResponse>('/health');
      return {
        connected: true,
        version: health.version,
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listFolders(): Promise<readonly GrafanaFolder[]> {
    // Use search API to get nested folder info (folderUid field)
    const folders = await this.request<GrafanaSearchFolderResponse[]>('/search?type=dash-folder');
    return folders.map(f => ({
      uid: f.uid,
      title: f.title,
      url: f.url,
      parentUid: f.folderUid, // Map folderUid to parentUid for nested folders
    }));
  }

  async getFolder(uid: string): Promise<GrafanaFolder | null> {
    try {
      const folder = await this.request<GrafanaFolderResponse>(`/folders/${uid}`);
      return this.mapFolder(folder);
    } catch {
      return null;
    }
  }

  async listContactPoints(): Promise<readonly GrafanaContactPoint[]> {
    try {
      const contactPoints = await this.request<GrafanaContactPointResponse[]>(
        '/v1/provisioning/contact-points'
      );
      return contactPoints.map(cp => ({
        uid: cp.uid,
        name: cp.name,
        type: cp.type,
      }));
    } catch {
      // Fall back to older API or return defaults
      return [{ uid: 'default', name: 'default', type: 'email' }];
    }
  }

  async listDataSources(): Promise<readonly GrafanaDataSource[]> {
    const dataSources = await this.request<GrafanaDataSourceResponse[]>('/datasources');
    return dataSources.map(ds => ({
      uid: ds.uid,
      name: ds.name,
      type: ds.type,
      url: ds.url,
    }));
  }

  async getDataSourcesByType(type: DataSourceType): Promise<readonly GrafanaDataSource[]> {
    const allDataSources = await this.listDataSources();

    const typeMap: Record<DataSourceType, string[]> = {
      cloudwatch: ['cloudwatch'],
      prometheus: ['prometheus', 'cortex', 'mimir'],
    };

    const matchingTypes = typeMap[type];
    return allDataSources.filter(ds => matchingTypes.includes(ds.type.toLowerCase()));
  }

  toDataSourceRef(dataSource: GrafanaDataSource): DataSourceRef {
    const type = this.mapDataSourceType(dataSource.type);
    return {
      uid: dataSource.uid,
      type,
      name: dataSource.name,
    };
  }

  async getCloudWatchDimensionValues(
    dataSourceUid: string,
    namespace: string,
    metricName: string,
    dimensionKey: string,
    region: string
  ): Promise<CloudWatchDimensionValues> {
    try {
      // Query Grafana's CloudWatch data source resource endpoint
      const params = new URLSearchParams({
        namespace,
        region,
        dimensionKey,
        metricName,
      });

      const response = await this.request<Array<{ value: string }>>(
        `/datasources/uid/${dataSourceUid}/resources/dimension-values?${params}`
      );

      return {
        dimensionKey,
        values: response.map(r => r.value),
        region,
        namespace,
      };
    } catch (error) {
      // Return empty values on error (data source may not have access)
      return {
        dimensionKey,
        values: [],
        region,
        namespace,
      };
    }
  }

  async checkCloudWatchNamespaceHealth(
    dataSourceUid: string,
    namespace: string,
    region: string
  ): Promise<CloudWatchNamespaceHealth> {
    try {
      // Query available metrics for this namespace - if we get any, the namespace is accessible
      const params = new URLSearchParams({
        namespace,
        region,
      });

      const response = await this.request<Array<{ value: string }>>(
        `/datasources/uid/${dataSourceUid}/resources/metrics?${params}`
      );

      return {
        namespace,
        region,
        hasMetrics: response.length > 0,
        metricCount: response.length,
      };
    } catch (error) {
      // Error means we can't access the namespace at all
      return {
        namespace,
        region,
        hasMetrics: false,
        metricCount: 0,
      };
    }
  }

  private mapFolder(folder: GrafanaFolderResponse): GrafanaFolder {
    return {
      uid: folder.uid,
      title: folder.title,
      url: folder.url,
      parentUid: folder.parentUid,
    };
  }

  private mapDataSourceType(grafanaType: string): DataSourceType {
    const lower = grafanaType.toLowerCase();
    if (lower === 'cloudwatch') {
      return 'cloudwatch';
    }
    if (['prometheus', 'cortex', 'mimir'].includes(lower)) {
      return 'prometheus';
    }
    // Default to prometheus for unknown types
    return 'prometheus';
  }
}

export function createGrafanaApiAdapter(config: { url: string; apiKey?: string }): GrafanaPort {
  return new GrafanaApiAdapter(config);
}
