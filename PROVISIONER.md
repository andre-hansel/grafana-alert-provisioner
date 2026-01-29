# AWS-to-Grafana Alert Provisioner

## Overview

A TUI application that discovers customer AWS infrastructure and generates a reviewable TypeScript script to provision matching Grafana alerts. Designed for multi-tenant cloud environments with folder-based Grafana tenancy.

## Quick Start

```bash
# Install dependencies
bun install

# Run the provisioner
bun run start
```

Credentials (AWS and Grafana) can be entered directly in the TUI flow - no need to set environment variables beforehand.

## Project Status: COMPLETE

All core features implemented:
- ✅ AWS Discovery (EC2, RDS, Lambda, ECS, EKS, ElastiCache, ALB/NLB, API Gateway, S3, SQS)
- ✅ Grafana data source selection (CloudWatch + Prometheus support)
- ✅ YAML-based alert templates
- ✅ TUI workflow with Clack prompts
- ✅ In-flow credential entry (AWS + Grafana)
- ✅ Navigation: Retry/Back/Exit at each step
- ✅ Script generation with embedded Grafana client
- ✅ Hexagonal architecture (ports & adapters)

## Architecture

> See [DIAGRAMS.md](./DIAGRAMS.md) for visual architecture and flow diagrams.

### Folder Structure

```
src/
├── domain/                    # Core business logic (no external dependencies)
│   ├── entities/
│   │   ├── alert.ts           # AlertRule, PendingAlert, queries
│   │   ├── aws-resource.ts    # All AWS resource types, DiscoveredResources
│   │   ├── template.ts        # AlertTemplate, TemplateMatch
│   │   └── customer.ts        # Customer/tenant entity
│   ├── services/
│   │   ├── template-matcher.ts    # Match resources to templates
│   │   └── alert-builder.ts       # Build alerts from templates + resources
│   └── value-objects/
│       ├── threshold.ts           # Threshold with operator
│       └── data-source-ref.ts     # CloudWatch/Prometheus config
│
├── ports/                     # Interfaces (contracts)
│   ├── inbound/
│   │   └── workflow-port.ts   # TUI workflow interface
│   └── outbound/
│       ├── aws-discovery-port.ts      # AWS discovery contract
│       ├── grafana-port.ts            # Grafana API contract
│       ├── template-repository-port.ts # Template storage contract
│       └── script-generator-port.ts   # Script output contract
│
├── adapters/                  # Implementations
│   ├── inbound/
│   │   └── cli/
│   │       ├── tui-workflow.ts    # Clack-based TUI
│   │       └── prompts/           # Individual prompt modules
│   │           ├── customer-setup.ts
│   │           ├── grafana-setup.ts   # Grafana connection + data source selection
│   │           ├── aws-discovery.ts
│   │           ├── template-matching.ts
│   │           ├── alert-customization.ts
│   │           ├── preview.ts
│   │           └── script-generation.ts
│   └── outbound/
│       ├── aws/
│       │   ├── aws-discovery-adapter.ts
│       │   └── services/          # Per-service discovery (ec2, rds, lambda, etc.)
│       ├── grafana/
│       │   └── grafana-api-adapter.ts
│       ├── filesystem/
│       │   └── yaml-template-repository.ts
│       └── codegen/
│           └── typescript-script-generator.ts
│
├── application/               # Use cases
│   ├── discover-infrastructure.ts
│   ├── match-templates.ts
│   ├── customize-alerts.ts
│   ├── preview-alerts.ts
│   └── generate-script.ts
│
├── config/
│   └── index.ts               # App configuration from env vars
│
└── index.ts                   # Entry point with state machine workflow
```

## TUI Workflow

> See [DIAGRAMS.md](./DIAGRAMS.md) for detailed workflow and data source selection flowcharts.

8-step workflow with state machine navigation:

1. **Customer Setup** → Enter name, folder, regions (multi-select), contact point
2. **Grafana Setup** → Connect to Grafana, select data sources (CloudWatch/Prometheus)
3. **AWS Discovery** → Enter credentials (paste export commands), scan resources across all selected regions with feature detection
4. **CloudWatch Validation** → Verify discovered resources have CloudWatch metrics, diagnose issues, generate report
5. **Template Matching** → Smart template selection with tiered defaults based on detected features
6. **Alert Customization** → Tune thresholds, intervals, severity, data source per alert
7. **Preview** → Review all alerts before generation
8. **Script Generation** → Output executable TypeScript

### Grafana Data Source Selection

When connecting to Grafana, you select which data sources to use for alerts:

| Data Source Count | Behavior |
|-------------------|----------|
| 1 source | Auto-selected |
| 2-6 sources | Direct multiselect (space to toggle) |
| >6 sources | Choose: Filter by name / Show all / Use first one |

Both CloudWatch and Prometheus data sources are supported. Select any combination based on your setup.

### Navigation Controls

| Action | How |
|--------|-----|
| Cancel current step | `Ctrl+C` |
| When cancelled, choose | Retry / Go back one step / Exit |
| Review then go back | Select "No" at confirmation prompts |

## AWS Discovery with Feature Detection

During AWS discovery, the tool scans resources and detects configuration features that inform template selection. This enables smart defaults that only enable relevant alerts.

### Detected Features

| Service | Feature | Detection Method | Enables Template |
|---------|---------|------------------|------------------|
| RDS | Read Replicas | Has `ReadReplicaDBInstanceIdentifiers` or is a replica source | `rds-critical-replica-lag` |
| RDS | Storage Auto-Scaling | `MaxAllocatedStorage > AllocatedStorage` | Display only |
| Lambda | DLQ Configured | Has `DeadLetterConfig` | `lambda-dead-letter-errors` |
| ElastiCache | Replication | Part of replication group or multi-node cluster | `elasticache-critical-replication-lag` |
| ECS | Auto-Scaling | Has Application Auto Scaling scalable targets | Display only |
| SQS | Dead Letter Queue | Has `RedrivePolicy` attribute | Display only |

## CloudWatch Validation

After AWS discovery, the tool validates that discovered resources actually have CloudWatch metrics available. This prevents creating alerts that would immediately show "No Data".

### How Validation Works

1. **Namespace Health Check**: Queries Grafana's CloudWatch data source to verify namespace accessibility
2. **Dimension Value Matching**: Compares discovered resource identifiers against CloudWatch dimension values
3. **Root Cause Diagnosis**: Uses verified AWS state to determine why resources lack metrics
4. **Report Generation**: Creates a markdown report documenting all findings

### Verified Root Causes

The validator only reports root causes it can verify from AWS API data:

| Root Cause | Verification Method | Action |
|------------|---------------------|--------|
| **Permissions** | Namespace has no metrics at all | Excluded |
| **Stopped Resource** | EC2 `state`, RDS `status`, ECS `runningCount` | Excluded |
| **Config Required** | ECS `containerInsightsEnabled`, S3 `hasRequestMetrics` | Excluded |
| **Lambda@Edge** | Lambda `GetPolicy` API (checks CloudFront permissions) | Excluded |
| **No Targets** | ALB/NLB `registeredTargetCount === 0` | Excluded |
| **No Activity** | Resource is active but no metrics exist | Excluded |
| **Unknown** | Cannot determine with certainty | Excluded |

### Load Balancer Target Health

ALBs and NLBs receive special handling based on target health:

| Condition | Action | Rationale |
|-----------|--------|-----------|
| **0 registered targets** | Excluded | Monitoring is meaningless - nothing to become unhealthy |
| **All targets unhealthy** | Included (Warning) | Real problems should trigger alerts, even immediately |

The `no_targets` exclusion is based on "monitoring provides no value", not "intent was detected":
- If there are 0 targets, health alerts either show 0 (meaningless) or always fire (false positive)
- Even if it's a misconfiguration, alerting won't help - the problem is "no targets", not "unhealthy targets"

### AWS API Checks Performed

| Service | API | Field Checked |
|---------|-----|---------------|
| EC2 | DescribeInstances | `state` (running/stopped) |
| RDS | DescribeDBInstances | `status` (available/stopped) |
| Lambda | GetPolicy | CloudFront/EdgeLambda in policy principals |
| ECS | DescribeClusters | `settings.containerInsights` |
| ECS | DescribeServices | `runningCount`, `desiredCount` |
| S3 | GetBucketMetricsConfiguration | Request metrics enabled |
| ALB/NLB | DescribeLoadBalancers | `state` (active/provisioning) |
| ALB/NLB | DescribeTargetHealth | `registeredTargetCount`, `healthyTargetCount` |
| ElastiCache | DescribeCacheClusters | `status` (available) |

### Validation Report

When issues are found, you're prompted to save a markdown report for documentation:

```markdown
# CloudWatch Validation Report
**Customer:** Spacelift
**Generated:** January 29, 2026 at 02:15 PM EST

## Summary
- Total Discovered: 166
- Included in Monitoring: 112
- Excluded from Monitoring: 54
- Warnings: 2

## Warnings

The following resources are **included in monitoring** but have conditions that may
cause alerts to fire immediately after deployment.

### Load Balancers With All Targets Unhealthy

**Verified via:** ELBv2 DescribeTargetHealth API

**Rationale:** These load balancers have registered targets but all are currently unhealthy.
Alerts for these resources **will fire immediately** after deployment. This is intentional -
if there is a real problem, you want to know about it.

- `spacelift-profiling-nlb` (NLB, us-east-2)
  - Healthy: 0, Unhealthy: 4
  - Unhealthy targets:
    - `i-0abc123`: Target.FailedHealthChecks

**Decision:** INCLUDED - real problems should trigger alerts, even immediately after deployment

## Exclusions

### Load Balancers With No Targets

**Verified via:** ELBv2 DescribeTargetHealth API

**Rationale:** These load balancers have no targets registered. There is nothing to
become unhealthy, so health-based alerts would be meaningless.

- `deprecated-nlb` (NLB, us-east-2)
  - Target Groups: 1, Registered Targets: 0

**Decision:** EXCLUDED - no targets to become unhealthy

### Stopped/Inactive Resources

**Rationale:** These resources exist in AWS but are not currently running.

| Resource | Service | Region | State |
|----------|---------|--------|-------|
| server-v2 | ECS | us-west-1 | runningCount=0 |

**Decision:** EXCLUDED - alerts would show "No Data"

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| Stopped Resources | 5 | Not running, no metrics emitted |
| No Targets | 1 | Load balancer has no registered targets |
| No Activity | 47 | No traffic/invocations, no metrics yet |
| **Total Excluded** | **54** | |
```

### Resource Filtering

Only validated resources proceed to template matching:

```
Discovery (166) → Validation (112 pass) → Template Matching (112)
```

Resources without CloudWatch metrics are excluded from alert creation since they would immediately show "No Data" in Grafana.

### Lambda@Edge Handling

Lambda@Edge functions emit metrics with a region prefix (e.g., `us-east-1.function_name`). The validator:

1. Checks if function has CloudFront/EdgeLambda permissions via `GetPolicy` API
2. If confirmed as Lambda@Edge, matches against both raw name and prefixed name
3. Reports unmatched edge functions with specific guidance

### Match Summary Display

When templates are matched, detected features are shown with checkmarks:

```
RDS
  Templates: 5
  Resources: 3
  Alert Rules: 5
  ✓ Read replicas detected

ECS
  Templates: 4
  Resources: 2
  Alert Rules: 4
  ✓ Auto-scaling configured on some services
```

## Template Tiering System

Templates are organized into three tiers that determine default selection behavior:

### Core Templates (Always Pre-Selected)

Essential alerts for outages and critical failures. These are pre-selected by default:

| Service | Core Templates |
|---------|----------------|
| EC2 | Critical-CPU, Status-Check-Failed |
| RDS | Critical-CPU, Critical-Memory, Low-Storage, Connectivity-Loss |
| Lambda | Critical-Errors |
| ECS | Critical-CPU, Critical-Memory, Running-Task-Count |
| ElastiCache | Critical-CPU, Critical-Memory-Usage, Connectivity-Loss |
| ALB | Unhealthy-Hosts, No-Healthy-Hosts, 5xx-Errors |
| NLB | Unhealthy-Hosts, No-Healthy-Hosts |
| API Gateway | 5xx-Errors |
| S3 | 5xx-Errors |
| SQS | Age-Of-Oldest-Message |

### Conditional Templates (Auto-Enabled When Feature Detected)

These templates are only pre-selected when the corresponding feature is detected during discovery:

| Template | Requires Feature |
|----------|------------------|
| `rds-critical-replica-lag` | RDS replicas detected |
| `lambda-dead-letter-errors` | Lambda DLQ configured |
| `elasticache-critical-replication-lag` | ElastiCache replication detected |

### Needs-Tuning Templates (Never Pre-Selected)

These require environment-specific baseline knowledge and are never auto-selected:

| Category | Templates | Reason |
|----------|-----------|--------|
| 4xx Errors | ALB, API Gateway, S3 | Client-caused errors, often not actionable |
| TCP Resets | NLB client/target/ELB resets | Need baseline to set meaningful threshold |
| Evictions | ElastiCache evictions | Acceptable levels vary by use case |
| Pending Tasks | ECS pending task count | Normal during auto-scaling events |

### Template Selection UI

During template matching, each template shows its tier:

```
Select EC2 alert templates (space to toggle, enter to confirm):
  [x] EC2-Alerts-Critical-CPU         [Core] critical
  [x] EC2-Alerts-Status-Check-Failed  [Core] critical
```

```
Select RDS alert templates:
  [x] RDS-Alerts-Critical-CPU         [Core] critical
  [x] RDS-Alerts-Critical-Replica-Lag [Detected] critical    # Only if replicas found
  [ ] RDS-Alerts-Critical-Replica-Lag [Conditional] critical # If no replicas
```

## Alert Templates

Templates in `templates/aws/{service}/*.yaml`:

```yaml
id: ec2-critical-cpu
name: "EC2-Alerts-Critical-CPU"
description: "Alert when any EC2 instance CPU exceeds critical threshold"
service: ec2
severity: critical

data_sources:
  cloudwatch:
    namespace: AWS/EC2
    metric: CPUUtilization
    statistic: Average
    dimensions: [InstanceId]
  prometheus:
    metric: node_cpu_seconds_total
    query: '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: ec2
  category: performance

annotations:
  summary: "Critical CPU on {{ $labels.instance_id }}"
  description: "CPU utilization is {{ $value }}% on instance {{ $labels.resource_name }}"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### Alert Naming Convention

All alert templates follow a consistent naming pattern: `{SERVICE}-Alerts-{AlertType}`

Examples:
- `EC2-Alerts-Critical-CPU`
- `RDS-Alerts-Low-Storage`
- `Lambda-Alerts-Critical-Errors`
- `ALB-Alerts-Unhealthy-Hosts`

### Wildcard-Based Resource Monitoring

Alerts use CloudWatch dimension wildcards (`*`) instead of specific instance IDs. This means:

| Behavior | Description |
|----------|-------------|
| **Automatic coverage** | New resources are monitored immediately without re-provisioning |
| **No stale alerts** | Terminated instances don't leave orphaned alert rules |
| **Auto-scaling friendly** | All instances in scaling groups are covered |
| **Single alert per type** | One alert rule monitors ALL resources of that type in a region |

**How it works**: CloudWatch returns separate time series for each resource when using wildcards. Grafana evaluates each time series independently against the threshold. The fired alert includes labels identifying the specific resource (e.g., `InstanceId: "i-0abc123"`).

```json
// Generated CloudWatch query
{
  "namespace": "AWS/EC2",
  "metricName": "CPUUtilization",
  "dimensions": {
    "InstanceId": "*"    // Monitors ALL EC2 instances
  }
}
```

### Included Templates

| Service | Templates |
|---------|-----------|
| EC2 | Critical-CPU, Status-Check-Failed |
| RDS | Critical-CPU, Critical-Memory, Low-Storage, Critical-Replica-Lag, Connectivity-Loss |
| Lambda | Critical-Errors, Dead-Letter-Errors |
| ECS | Critical-CPU, Critical-Memory, Running-Task-Count, Pending-Task-Count |
| EKS | Node-Not-Ready |
| ElastiCache | Critical-CPU, Critical-Memory-Usage, Critical-Evictions, Critical-Replication-Lag, Connectivity-Loss |
| ALB | 5xx-Errors, Target-5xx-Errors, Unhealthy-Hosts, No-Healthy-Hosts, Rejected-Connections |
| NLB | Unhealthy-Hosts, No-Healthy-Hosts, TCP-Client-Resets, TCP-Target-Resets, TCP-ELB-Resets |
| API Gateway | 4xx-Errors, 5xx-Errors, Critical-5xx-Errors |
| S3 | 4xx-Errors, 5xx-Errors, Critical-5xx-Errors |
| SQS | Age-Of-Oldest-Message, Critical-Message-Age |
| Aurora | Critical-CPU, Critical-Memory, Critical-Replica-Lag, Deadlocks, Connectivity-Loss |
| DynamoDB | System-Errors |
| CloudFront | Error-Rate, Critical-Error-Rate, 5xx-Error-Rate |
| Route53 | Health-Check-Failed, Health-Check-Degraded |
| And more... | See `templates/aws/` for full list |

## Generated Scripts

Output to `output/{customer}-alerts-{date}.ts`:

```typescript
#!/usr/bin/env bun
// Includes embedded GrafanaClient class
// Run with: GRAFANA_API_KEY=xxx bun run output/customer-alerts-2024-01-28.ts
```

The script:
1. Creates/ensures Grafana folder exists
2. Creates all alert rules via Grafana API
3. Sets notification policy for folder

## Configuration

Environment variables are optional - credentials can be entered in the TUI flow.

| Env Variable | Description | Default |
|--------------|-------------|---------|
| `GRAFANA_URL` | Grafana server URL | `http://localhost:3000` |
| `GRAFANA_API_KEY` | API key (Service Account Token) | Entered in TUI |
| `AWS_ACCESS_KEY_ID` | AWS access key | Entered in TUI |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Entered in TUI |
| `AWS_SESSION_TOKEN` | AWS session token | Entered in TUI |
| `TEMPLATES_PATH` | Alert templates directory | `./templates/aws` |
| `OUTPUT_PATH` | Generated scripts directory | `./alert_deployer/output` |

**Note**: AWS regions are selected interactively in the TUI (multi-select from US regions). Default is `us-east-1`.

## Development

```bash
# Type check
bun run typecheck

# Run in watch mode
bun run dev

# Run tests
bun test
```

## Key Files to Understand

- `src/index.ts` - Main entry, state machine workflow (8 steps)
- `src/adapters/inbound/cli/prompts/grafana-setup.ts` - Grafana connection and data source selection
- `src/adapters/inbound/cli/prompts/aws-discovery.ts` - AWS credential entry and resource discovery
- `src/adapters/inbound/cli/prompts/cloudwatch-validation.ts` - CloudWatch validation and diagnostics
- `src/adapters/inbound/cli/prompts/*.ts` - Other TUI steps
- `src/domain/services/cloudwatch-validator.ts` - Validation logic and root cause diagnosis
- `src/adapters/outbound/aws/services/*.ts` - AWS service discovery with feature detection
- `src/adapters/outbound/codegen/typescript-script-generator.ts` - Script output
- `templates/aws/**/*.yaml` - Alert template definitions

## Multi-Region Support

The provisioner supports scanning multiple AWS regions simultaneously:

### Region Selection
During Customer Setup, you can select one or more US regions:
- `us-east-1` (N. Virginia)
- `us-east-2` (Ohio)
- `us-west-1` (N. California)
- `us-west-2` (Oregon)

### How Multi-Region Affects Alerts

**CloudWatch queries are region-specific.** A single CloudWatch query can only fetch metrics from one region. Therefore:

- The tool creates **one alert rule per (template, region) combination**
- If you scan 2 regions and have 7 matching templates, you get **14 alert rules**
- Alert titles include region suffix when scanning multiple regions (e.g., "EC2-Alerts-Critical-CPU (us-west-2)")
- Rule groups are also region-specific (e.g., "customer-ec2-us-west-2")

### Example

| Regions Scanned | Service | Resources Found | Alert Rules Created |
|-----------------|---------|-----------------|---------------------|
| us-east-1, us-west-2 | Lambda | 50 in us-east-1, 10 in us-west-2 | 2 Lambda alerts (one per region) |
| us-east-1, us-west-2 | RDS | 3 in us-east-1, 0 in us-west-2 | 1 RDS alert (us-east-1 only) |
| us-east-1, us-west-2 | EKS | 0 in both regions | 0 EKS alerts |

**Important**: Alerts are only created for regions where resources actually exist. If you scan 4 regions but RDS only exists in us-east-1, you'll only get RDS alerts for us-east-1.

Each alert rule uses **wildcard-based monitoring** (`*`) to cover all resources of that type in that region. CloudWatch returns separate time series for each resource, and Grafana evaluates each independently against the threshold.

## Known Behaviors

1. **AWS Credentials**: Enter within the TUI flow by pasting AWS console export commands. The tool parses `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` from the pasted text.

2. **Grafana Connection**: Required. The tool connects to Grafana to fetch available data sources and contact points. You must select at least one data source before proceeding.

3. **Template Matching**: Templates are matched per (service, region). CloudWatch queries only work within a single region, so resources in different regions result in separate alert rules.

4. **Customization Options**:
   - "Use defaults" - Quick, applies template defaults with first data source
   - "Bulk customize" - Customize per template type, select data source
   - "Individual" - Customize each alert (limited to first 10)

5. **Data Source Selection**: When multiple data sources are available, you can select which one to use during alert customization. If only one is selected during Grafana setup, it's used automatically.

6. **Notification Policy**: The generated script sets up folder-based routing to your selected contact point (e.g., PagerDuty). This uses the Grafana Provisioning API with object matchers.
