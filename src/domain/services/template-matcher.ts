import type { AwsResource, DiscoveredResources, AwsServiceType, RdsResource } from '../entities/aws-resource.js';
import type { AlertTemplate, TemplateMatch } from '../entities/template.js';

/**
 * Check if a template is for Aurora (uses DBClusterIdentifier dimension)
 */
function isAuroraTemplate(template: AlertTemplate): boolean {
  const cwConfig = template.dataSources.cloudwatch;
  if (!cwConfig || cwConfig.type !== 'cloudwatch') return false;
  return cwConfig.dimensions?.includes('DBClusterIdentifier') ?? false;
}

/**
 * Check if a template is for standard RDS (uses DBInstanceIdentifier dimension)
 */
function isStandardRdsTemplate(template: AlertTemplate): boolean {
  const cwConfig = template.dataSources.cloudwatch;
  if (!cwConfig || cwConfig.type !== 'cloudwatch') return false;
  return cwConfig.dimensions?.includes('DBInstanceIdentifier') ?? false;
}

export interface TemplateMatcherOptions {
  readonly templates: readonly AlertTemplate[];
  readonly resources: DiscoveredResources;
}

export interface MatchResult {
  readonly matches: readonly TemplateMatch[];
  readonly unmatchedResources: readonly AwsResource[];
  readonly unmatchedTemplates: readonly AlertTemplate[];
}

export class TemplateMatcher {
  matchTemplates(options: TemplateMatcherOptions): MatchResult {
    const { templates, resources } = options;
    const matches: TemplateMatch[] = [];
    const matchedResourceIds = new Set<string>();
    const matchedTemplateIds = new Set<string>();

    const serviceTypes: AwsServiceType[] = [
      'ec2', 'rds', 'lambda', 'ecs', 'eks',
      'elasticache', 'alb', 'nlb', 'apigateway', 's3', 'sqs'
    ];

    for (const serviceType of serviceTypes) {
      const serviceResources = this.getResourcesForService(resources, serviceType);
      const serviceTemplates = templates.filter(t => t.service === serviceType);

      // Skip if no resources for this service
      if (serviceResources.length === 0) continue;

      // Special handling for RDS: split Aurora and standard RDS
      if (serviceType === 'rds') {
        const rdsResources = serviceResources as readonly RdsResource[];
        const auroraResources = rdsResources.filter(r => r.isAurora);
        const standardRdsResources = rdsResources.filter(r => !r.isAurora);

        const auroraTemplates = serviceTemplates.filter(isAuroraTemplate);
        const standardRdsTemplates = serviceTemplates.filter(isStandardRdsTemplate);

        // Match Aurora templates to Aurora resources
        if (auroraResources.length > 0 && auroraTemplates.length > 0) {
          const auroraByRegion = this.groupResourcesByRegion(auroraResources);
          for (const template of auroraTemplates) {
            for (const [region, regionResources] of auroraByRegion.entries()) {
              matches.push({
                template,
                region,
                resources: regionResources.map(r => ({
                  id: r.id,
                  name: r.name,
                  arn: r.arn,
                  region: r.region,
                })),
              });
            }
            matchedTemplateIds.add(template.id);
          }
          for (const resource of auroraResources) {
            matchedResourceIds.add(resource.id);
          }
        }

        // Match standard RDS templates to standard RDS resources
        if (standardRdsResources.length > 0 && standardRdsTemplates.length > 0) {
          const rdsByRegion = this.groupResourcesByRegion(standardRdsResources);
          for (const template of standardRdsTemplates) {
            for (const [region, regionResources] of rdsByRegion.entries()) {
              matches.push({
                template,
                region,
                resources: regionResources.map(r => ({
                  id: r.id,
                  name: r.name,
                  arn: r.arn,
                  region: r.region,
                })),
              });
            }
            matchedTemplateIds.add(template.id);
          }
          for (const resource of standardRdsResources) {
            matchedResourceIds.add(resource.id);
          }
        }

        continue; // Skip the generic matching below for RDS
      }

      // Generic matching for non-RDS services
      // Group resources by region (CloudWatch queries are region-specific)
      // Only regions with actual resources will appear in this map
      const resourcesByRegion = this.groupResourcesByRegion(serviceResources);

      // One match per (template, region) combination
      // Each template+region becomes one alert rule that covers all resources in that region
      // Alerts are NOT created for regions where no resources exist
      for (const template of serviceTemplates) {
        for (const [region, regionResources] of resourcesByRegion.entries()) {
          matches.push({
            template,
            region,
            resources: regionResources.map(r => ({
              id: r.id,
              name: r.name,
              arn: r.arn,
              region: r.region,
            })),
          });
        }
        matchedTemplateIds.add(template.id);
      }

      // Track which resources are covered
      for (const resource of serviceResources) {
        matchedResourceIds.add(resource.id);
      }
    }

    const allResources = this.getAllResources(resources);
    const unmatchedResources = allResources.filter(r => !matchedResourceIds.has(r.id));
    const unmatchedTemplates = templates.filter(t => !matchedTemplateIds.has(t.id));

    return {
      matches,
      unmatchedResources,
      unmatchedTemplates,
    };
  }

  groupMatchesByService(matches: readonly TemplateMatch[]): Map<AwsServiceType, TemplateMatch[]> {
    const grouped = new Map<AwsServiceType, TemplateMatch[]>();

    for (const match of matches) {
      const service = match.template.service;
      const existing = grouped.get(service) ?? [];
      grouped.set(service, [...existing, match]);
    }

    return grouped;
  }

  groupMatchesByTemplate(matches: readonly TemplateMatch[]): Map<string, TemplateMatch[]> {
    const grouped = new Map<string, TemplateMatch[]>();

    for (const match of matches) {
      const templateId = match.template.id;
      const existing = grouped.get(templateId) ?? [];
      grouped.set(templateId, [...existing, match]);
    }

    return grouped;
  }

  filterMatchesByService(
    matches: readonly TemplateMatch[],
    service: AwsServiceType
  ): readonly TemplateMatch[] {
    return matches.filter(m => m.template.service === service);
  }

  private getResourcesForService(
    resources: DiscoveredResources,
    service: AwsServiceType
  ): readonly AwsResource[] {
    switch (service) {
      case 'ec2':
        return resources.ec2;
      case 'rds':
        return resources.rds;
      case 'lambda':
        return resources.lambda;
      case 'ecs':
        return resources.ecs;
      case 'eks':
        return resources.eks;
      case 'elasticache':
        return resources.elasticache;
      case 'alb':
        return resources.alb;
      case 'nlb':
        return resources.nlb;
      case 'apigateway':
        return resources.apigateway;
      case 's3':
        return resources.s3;
      case 'sqs':
        return resources.sqs;
    }
  }

  private getAllResources(resources: DiscoveredResources): readonly AwsResource[] {
    return [
      ...resources.ec2,
      ...resources.rds,
      ...resources.lambda,
      ...resources.ecs,
      ...resources.eks,
      ...resources.elasticache,
      ...resources.alb,
      ...resources.nlb,
      ...resources.apigateway,
      ...resources.s3,
      ...resources.sqs,
    ];
  }

  private groupResourcesByRegion(resources: readonly AwsResource[]): Map<string, AwsResource[]> {
    const grouped = new Map<string, AwsResource[]>();

    for (const resource of resources) {
      const existing = grouped.get(resource.region) ?? [];
      grouped.set(resource.region, [...existing, resource]);
    }

    return grouped;
  }
}

export function createTemplateMatcher(): TemplateMatcher {
  return new TemplateMatcher();
}
