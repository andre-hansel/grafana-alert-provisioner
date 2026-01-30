/**
 * Extract Customer Resources from Alert Scripts
 *
 * Parses deployed alert scripts to extract:
 * - Customer name
 * - Grafana folder path
 * - Datasource UID
 * - Services with alerts (by ruleGroup)
 * - Regions with alerts
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { NAMESPACE_TO_SERVICE, DIMENSION_TO_SERVICE } from '../config/dashboard-service-map.js';

export interface CustomerDeployment {
  /** Customer name (from script header) */
  customer: string;
  /** Directory name in docs/deployments/ */
  deploymentDir: string;
  /** Full path to alert script */
  scriptPath: string;
  /** Grafana folder path (e.g., "NOC-Monitoring/AWS/Customer-123") */
  folderPath: string;
  /** CloudWatch datasource UID */
  datasourceUid: string;
  /** Services with deployed alerts, mapped to their regions */
  services: Map<string, ServiceInfo>;
  /** All regions with alerts */
  regions: string[];
  /** Alert count */
  alertCount: number;
  /** Script generation date */
  generatedDate: string;
}

export interface ServiceInfo {
  /** Service type (e.g., 'ec2', 'rds', 'lambda') */
  service: string;
  /** Rule group name (e.g., 'EC2-Alerts', 'RDS-Alerts') */
  ruleGroup: string;
  /** CloudWatch namespace */
  namespace: string;
  /** Regions where this service has alerts */
  regions: string[];
  /** Number of alert rules for this service */
  alertCount: number;
}

/**
 * Find all customer deployments in docs/deployments/
 */
export function listCustomerDeployments(deploymentsPath: string): string[] {
  if (!existsSync(deploymentsPath)) {
    return [];
  }

  return readdirSync(deploymentsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort();
}

/**
 * Find the alert script file in a customer deployment directory
 */
export function findAlertScript(deploymentDir: string): string | null {
  if (!existsSync(deploymentDir)) {
    return null;
  }

  const files = readdirSync(deploymentDir);

  // Look for files matching pattern: *-alerts-*.ts
  const scriptFile = files.find(f => f.match(/-alerts-\d{4}-\d{2}-\d{2}\.ts$/));
  return scriptFile ? join(deploymentDir, scriptFile) : null;
}

/**
 * Parse an alert script to extract customer resources
 */
export function parseAlertScript(scriptPath: string): CustomerDeployment | null {
  if (!existsSync(scriptPath)) {
    return null;
  }

  const content = readFileSync(scriptPath, 'utf-8');

  // Extract header comments
  const customerMatch = content.match(/\* Customer: (.+)/);
  const folderMatch = content.match(/\* Folder: (.+)/);
  const alertCountMatch = content.match(/\* Alert Count: (\d+)/);
  const generatedMatch = content.match(/\* Generated: (.+)/);

  if (!customerMatch?.[1] || !folderMatch?.[1]) {
    return null;
  }

  const customer = customerMatch[1].trim();
  const folderPath = folderMatch[1].trim();
  const alertCount = alertCountMatch?.[1] ? parseInt(alertCountMatch[1], 10) : 0;
  const generatedDate = generatedMatch?.[1]?.trim() ?? '';

  // Extract datasource UID from alert data (skip __expr__ datasources)
  const datasourceMatches = content.matchAll(/"datasourceUid":\s*"([^"]+)"/g);
  let datasourceUid = '';
  for (const match of datasourceMatches) {
    if (match[1] && match[1] !== '__expr__') {
      datasourceUid = match[1];
      break;
    }
  }

  // Extract services by parsing ruleGroup and namespace from alerts
  const services = extractServices(content);

  // Extract all unique regions
  const regionMatches = content.matchAll(/"region":\s*"([^"]+)"/g);
  const regions = [...new Set([...regionMatches].map(m => m[1]).filter((r): r is string => r !== undefined && r !== 'default'))];

  const deploymentDir = basename(scriptPath.replace(/\/[^/]+$/, ''));

  return {
    customer,
    deploymentDir,
    scriptPath,
    folderPath,
    datasourceUid,
    services,
    regions,
    alertCount,
    generatedDate,
  };
}

/**
 * Extract services from alert script content
 */
function extractServices(content: string): Map<string, ServiceInfo> {
  const services = new Map<string, ServiceInfo>();

  // Parse alert blocks to extract service info
  // Each alert has uid, title, ruleGroup, and data array with model containing namespace
  const alertBlocks = content.split(/\n  \{[\s\n]*uid:/);

  for (let i = 1; i < alertBlocks.length; i++) {
    const block = alertBlocks[i];
    if (!block) continue;

    // Extract ruleGroup
    const ruleGroupMatch = block.match(/ruleGroup:\s*["']([^"']+)["']/);
    if (!ruleGroupMatch?.[1]) continue;
    const ruleGroup = ruleGroupMatch[1];

    // Extract namespace
    const namespaceMatch = block.match(/"namespace":\s*"([^"]+)"/);
    if (!namespaceMatch?.[1]) continue;
    const namespace = namespaceMatch[1];

    // Extract region
    const regionMatch = block.match(/"region":\s*"([^"]+)"/);
    const region = regionMatch?.[1] ?? 'us-east-1';

    // Determine service type from namespace
    let serviceType = NAMESPACE_TO_SERVICE[namespace];

    // Special handling for Aurora (uses AWS/RDS namespace but has DBClusterIdentifier)
    if (namespace === 'AWS/RDS' && block.includes('DBClusterIdentifier')) {
      serviceType = 'aurora';
    }

    if (!serviceType) {
      // Try to infer from ruleGroup name
      const ruleGroupLower = ruleGroup.toLowerCase();
      for (const [, svc] of Object.entries(DIMENSION_TO_SERVICE)) {
        if (ruleGroupLower.includes(svc)) {
          serviceType = svc;
          break;
        }
      }
    }

    if (!serviceType) continue;

    // Add or update service info
    const existing = services.get(serviceType);
    if (existing) {
      existing.alertCount++;
      if (!existing.regions.includes(region)) {
        existing.regions.push(region);
      }
    } else {
      services.set(serviceType, {
        service: serviceType,
        ruleGroup,
        namespace,
        regions: [region],
        alertCount: 1,
      });
    }
  }

  return services;
}

/**
 * Load all customer deployments from docs/deployments/
 */
export function loadAllDeployments(deploymentsPath: string): CustomerDeployment[] {
  const customers = listCustomerDeployments(deploymentsPath);
  const deployments: CustomerDeployment[] = [];

  for (const customerDir of customers) {
    const deploymentPath = join(deploymentsPath, customerDir);
    const scriptPath = findAlertScript(deploymentPath);

    if (scriptPath) {
      const deployment = parseAlertScript(scriptPath);
      if (deployment) {
        deployment.deploymentDir = customerDir;
        deployments.push(deployment);
      }
    }
  }

  return deployments;
}

/**
 * Format service count for display
 */
export function formatServiceCount(services: Map<string, ServiceInfo>): string {
  const count = services.size;
  return `${count} service${count === 1 ? '' : 's'}`;
}

/**
 * Get services as sorted array for display
 */
export function getSortedServices(services: Map<string, ServiceInfo>): ServiceInfo[] {
  return [...services.values()].sort((a, b) => a.service.localeCompare(b.service));
}
