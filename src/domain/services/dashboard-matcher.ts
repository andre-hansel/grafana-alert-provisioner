/**
 * Dashboard Template Matcher
 *
 * Matches discovered AWS resources to available dashboard templates.
 * Groups by service and region, similar to the alert template matcher.
 */

import type { DiscoveredResources, AwsServiceType } from '../entities/aws-resource.js';
import type { DashboardTemplate, DashboardMatch } from '../entities/dashboard.js';
import { DASHBOARD_SERVICE_MAP } from '../../config/dashboard-service-map.js';

export interface DashboardMatcherOptions {
  resources: DiscoveredResources;
  /** Optional custom template map (defaults to DASHBOARD_SERVICE_MAP) */
  templates?: Record<string, DashboardTemplate>;
}

export interface DashboardMatchResult {
  /** Matches found (one per service/region with both resources and template) */
  matches: readonly DashboardMatch[];
  /** Services with resources but no dashboard template */
  gaps: readonly string[];
  /** Services with templates but no discovered resources */
  unusedTemplates: readonly string[];
}

const SERVICE_TYPES: AwsServiceType[] = [
  'ec2', 'rds', 'lambda', 'ecs', 'eks',
  'elasticache', 'alb', 'nlb', 'apigateway', 's3', 'sqs'
];

/**
 * Get resource count for a service from discovered resources
 */
function getResourcesForService(
  resources: DiscoveredResources,
  service: AwsServiceType
): readonly { region: string }[] {
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
    default:
      return [];
  }
}

/**
 * Group resources by region
 */
function groupByRegion(resources: readonly { region: string }[]): Map<string, number> {
  const byRegion = new Map<string, number>();
  for (const resource of resources) {
    const count = byRegion.get(resource.region) ?? 0;
    byRegion.set(resource.region, count + 1);
  }
  return byRegion;
}

/**
 * Match discovered resources to dashboard templates.
 * Creates one match per (service, region) combination where both
 * resources exist and a template is available.
 */
export function matchDashboardTemplates(options: DashboardMatcherOptions): DashboardMatchResult {
  const { resources, templates = DASHBOARD_SERVICE_MAP } = options;

  const matches: DashboardMatch[] = [];
  const servicesWithResources = new Set<string>();
  const servicesWithTemplates = new Set(Object.keys(templates));
  const gaps: string[] = [];

  for (const serviceType of SERVICE_TYPES) {
    const serviceResources = getResourcesForService(resources, serviceType);

    if (serviceResources.length === 0) {
      continue;
    }

    servicesWithResources.add(serviceType);

    // Handle special case for RDS: split into rds and aurora
    if (serviceType === 'rds') {
      const rdsResources = resources.rds;
      const auroraResources = rdsResources.filter(r => r.isAurora);
      const standardRdsResources = rdsResources.filter(r => !r.isAurora);

      // Aurora dashboards
      if (auroraResources.length > 0) {
        const auroraTemplate = templates['aurora'];
        if (auroraTemplate) {
          servicesWithResources.add('aurora');
          const byRegion = groupByRegion(auroraResources);
          for (const [region, count] of byRegion) {
            matches.push({
              service: 'aurora',
              region,
              template: auroraTemplate,
              resourceCount: count,
            });
          }
        } else {
          gaps.push('aurora');
        }
      }

      // Standard RDS dashboards
      if (standardRdsResources.length > 0) {
        const rdsTemplate = templates['rds'];
        if (rdsTemplate) {
          const byRegion = groupByRegion(standardRdsResources);
          for (const [region, count] of byRegion) {
            matches.push({
              service: 'rds',
              region,
              template: rdsTemplate,
              resourceCount: count,
            });
          }
        } else {
          gaps.push('rds');
        }
      }

      continue;
    }

    // Standard service matching
    const template = templates[serviceType];
    if (template) {
      const byRegion = groupByRegion(serviceResources);
      for (const [region, count] of byRegion) {
        matches.push({
          service: serviceType,
          region,
          template,
          resourceCount: count,
        });
      }
    } else {
      gaps.push(serviceType);
    }
  }

  // Find unused templates (services with templates but no resources)
  const unusedTemplates: string[] = [];
  for (const templateService of servicesWithTemplates) {
    if (!servicesWithResources.has(templateService)) {
      unusedTemplates.push(templateService);
    }
  }

  return {
    matches,
    gaps,
    unusedTemplates,
  };
}

/**
 * Group matches by service for display purposes.
 */
export function groupMatchesByService(
  matches: readonly DashboardMatch[]
): Map<string, DashboardMatch[]> {
  const grouped = new Map<string, DashboardMatch[]>();

  for (const match of matches) {
    const existing = grouped.get(match.service) ?? [];
    grouped.set(match.service, [...existing, match]);
  }

  return grouped;
}

/**
 * Aggregate matches into selections (one per service, combining all regions).
 */
export function aggregateToSelections(
  matches: readonly DashboardMatch[],
  gaps: readonly string[]
): {
  selections: Map<string, {
    service: string;
    template: DashboardTemplate | null;
    hasTemplate: boolean;
    regions: string[];
    totalResourceCount: number;
  }>;
} {
  const selections = new Map<string, {
    service: string;
    template: DashboardTemplate | null;
    hasTemplate: boolean;
    regions: string[];
    totalResourceCount: number;
  }>();

  // Add services with templates
  for (const match of matches) {
    const existing = selections.get(match.service);
    if (existing) {
      if (!existing.regions.includes(match.region)) {
        existing.regions.push(match.region);
      }
      existing.totalResourceCount += match.resourceCount;
    } else {
      selections.set(match.service, {
        service: match.service,
        template: match.template,
        hasTemplate: true,
        regions: [match.region],
        totalResourceCount: match.resourceCount,
      });
    }
  }

  // Add gaps (services without templates)
  for (const gap of gaps) {
    if (!selections.has(gap)) {
      selections.set(gap, {
        service: gap,
        template: null,
        hasTemplate: false,
        regions: [],
        totalResourceCount: 0,
      });
    }
  }

  return { selections };
}
