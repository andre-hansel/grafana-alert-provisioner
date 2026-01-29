import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { TemplateRepositoryPort } from '../../../ports/outbound/template-repository-port.js';
import type { AlertTemplate, AlertSeverity, CustomizableField } from '../../../domain/entities/template.js';
import type { AwsServiceType } from '../../../domain/entities/aws-resource.js';
import type { CloudWatchDataSourceConfig, PrometheusDataSourceConfig } from '../../../domain/value-objects/data-source-ref.js';
import type { ThresholdOperator } from '../../../domain/value-objects/threshold.js';

interface RawYamlTemplate {
  id: string;
  name: string;
  description: string;
  service: string;
  severity: string;
  data_sources?: {
    cloudwatch?: {
      namespace: string;
      metric: string;
      statistic: string;
      dimensions: string[];
      period?: number;
    };
    prometheus?: {
      metric: string;
      query: string;
    };
  };
  // Legacy single data source format
  data_source?: {
    type: string;
    namespace?: string;
    metric: string;
    statistic?: string;
    dimensions?: string[];
    period?: number;
    query?: string;
  };
  defaults: {
    threshold: number;
    threshold_operator?: string;
    evaluation_interval: string;
    for_duration: string;
  };
  labels: Record<string, string>;
  annotations: {
    summary: string;
    description: string;
    runbook_url?: string;
  };
  customizable: string[];
}

export class YamlTemplateRepository implements TemplateRepositoryPort {
  private templatesPath: string;
  private templateCache: Map<string, AlertTemplate> = new Map();
  private loaded = false;

  constructor(templatesPath: string) {
    this.templatesPath = templatesPath;
  }

  async loadAllTemplates(): Promise<readonly AlertTemplate[]> {
    if (!this.loaded) {
      await this.loadTemplatesFromDisk();
      this.loaded = true;
    }
    return Array.from(this.templateCache.values());
  }

  async loadTemplatesByService(service: AwsServiceType): Promise<readonly AlertTemplate[]> {
    const allTemplates = await this.loadAllTemplates();
    return allTemplates.filter(t => t.service === service);
  }

  async getTemplate(id: string): Promise<AlertTemplate | null> {
    await this.loadAllTemplates();
    return this.templateCache.get(id) ?? null;
  }

  getTemplatesPath(): string {
    return this.templatesPath;
  }

  private async loadTemplatesFromDisk(): Promise<void> {
    const services = await readdir(this.templatesPath);

    for (const service of services) {
      const servicePath = join(this.templatesPath, service);

      try {
        const files = await readdir(servicePath);
        const yamlFiles = files.filter(f => extname(f) === '.yaml' || extname(f) === '.yml');

        for (const file of yamlFiles) {
          const filePath = join(servicePath, file);
          try {
            const content = await readFile(filePath, 'utf-8');
            const raw = parseYaml(content) as RawYamlTemplate;
            const template = this.parseTemplate(raw);
            this.templateCache.set(template.id, template);
          } catch (error) {
            console.error(`Error parsing template ${filePath}:`, error);
          }
        }
      } catch {
        // Service directory doesn't exist or isn't readable, skip it
      }
    }
  }

  private parseTemplate(raw: RawYamlTemplate): AlertTemplate {
    const dataSources = this.parseDataSources(raw);

    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      service: raw.service as AwsServiceType,
      severity: raw.severity as AlertSeverity,
      dataSources,
      defaults: {
        threshold: raw.defaults.threshold,
        thresholdOperator: (raw.defaults.threshold_operator ?? 'gt') as ThresholdOperator,
        evaluationInterval: raw.defaults.evaluation_interval,
        forDuration: raw.defaults.for_duration,
      },
      labels: Object.freeze(raw.labels),
      annotations: {
        summary: raw.annotations.summary,
        description: raw.annotations.description,
        runbook_url: raw.annotations.runbook_url,
      },
      customizable: raw.customizable as CustomizableField[],
    };
  }

  private parseDataSources(raw: RawYamlTemplate): AlertTemplate['dataSources'] {
    const result: {
      cloudwatch?: CloudWatchDataSourceConfig;
      prometheus?: PrometheusDataSourceConfig;
    } = {};

    // Handle new multi-data-source format
    if (raw.data_sources) {
      if (raw.data_sources.cloudwatch) {
        result.cloudwatch = {
          type: 'cloudwatch',
          namespace: raw.data_sources.cloudwatch.namespace,
          metric: raw.data_sources.cloudwatch.metric,
          statistic: raw.data_sources.cloudwatch.statistic as CloudWatchDataSourceConfig['statistic'],
          dimensions: raw.data_sources.cloudwatch.dimensions,
          period: raw.data_sources.cloudwatch.period,
        };
      }
      if (raw.data_sources.prometheus) {
        result.prometheus = {
          type: 'prometheus',
          metric: raw.data_sources.prometheus.metric,
          query: raw.data_sources.prometheus.query,
        };
      }
    }
    // Handle legacy single data source format
    else if (raw.data_source) {
      if (raw.data_source.type === 'cloudwatch') {
        result.cloudwatch = {
          type: 'cloudwatch',
          namespace: raw.data_source.namespace ?? '',
          metric: raw.data_source.metric,
          statistic: (raw.data_source.statistic ?? 'Average') as CloudWatchDataSourceConfig['statistic'],
          dimensions: raw.data_source.dimensions ?? [],
          period: raw.data_source.period,
        };
      } else if (raw.data_source.type === 'prometheus') {
        result.prometheus = {
          type: 'prometheus',
          metric: raw.data_source.metric,
          query: raw.data_source.query ?? '',
        };
      }
    }

    return result;
  }
}

export function createYamlTemplateRepository(templatesPath: string): TemplateRepositoryPort {
  return new YamlTemplateRepository(templatesPath);
}
