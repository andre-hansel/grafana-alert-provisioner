/**
 * Dashboard Domain Entities
 *
 * Types for dashboard provisioning workflow.
 */

import type { AwsServiceType } from './aws-resource.js';

/**
 * Dashboard template definition.
 * Maps to a template file in dashboards/templates/
 */
export interface DashboardTemplate {
  /** Template filename without path */
  filename: string;
  /** Human-readable dashboard title */
  title: string;
  /** CloudWatch namespace used by this dashboard */
  namespace: string;
  /** Primary dimension key for resource filtering */
  dimensionKey: string;
  /** Variable name in the dashboard template */
  variableName: string;
}

/**
 * A match between discovered AWS resources and a dashboard template.
 * One match per (service, region) combination.
 */
export interface DashboardMatch {
  /** The service type (ec2, rds, lambda, etc.) */
  service: AwsServiceType | string;
  /** Region where resources were discovered */
  region: string;
  /** Dashboard template for this service */
  template: DashboardTemplate;
  /** Number of resources discovered for this service/region */
  resourceCount: number;
}

/**
 * Result of dashboard matching step.
 */
export interface DashboardMatchingResult {
  /** All matches found */
  matches: readonly DashboardMatch[];
  /** Services without available templates */
  gaps: readonly string[];
  /** Whether matching was confirmed to proceed */
  confirmed: boolean;
}

/**
 * User's selection of dashboards to deploy.
 */
export interface DashboardSelection {
  /** The service type */
  service: string;
  /** Dashboard template */
  template: DashboardTemplate;
  /** Whether the user selected this dashboard */
  selected: boolean;
  /** Whether a template exists for this service */
  hasTemplate: boolean;
  /** Regions with resources for this service */
  regions: string[];
  /** Total resources across all regions */
  totalResourceCount: number;
}

/**
 * Result of dashboard selection step.
 */
export interface DashboardSelectionResult {
  /** All selections (including deselected) */
  selections: readonly DashboardSelection[];
  /** Only selected dashboards */
  selectedDashboards: readonly DashboardSelection[];
  /** Whether selection was confirmed */
  confirmed: boolean;
}

/**
 * Result of dashboard preview step.
 */
export interface DashboardPreviewResult {
  /** Whether preview was confirmed to proceed to generation */
  confirmed: boolean;
}

/**
 * Configuration for a single dashboard to generate.
 */
export interface DashboardGenerationConfig {
  /** Service type */
  service: string;
  /** Dashboard template */
  template: DashboardTemplate;
  /** Full path to template JSON file */
  templatePath: string;
  /** Customer-specific title */
  title: string;
}

/**
 * Result of dashboard script generation.
 */
export interface DashboardScriptGenerationResult {
  /** Path to generated script */
  outputPath: string;
  /** Generated filename */
  filename: string;
  /** Number of dashboards in script */
  dashboardCount: number;
}
