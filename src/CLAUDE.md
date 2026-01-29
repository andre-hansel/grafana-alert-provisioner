# Alert Provisioner - Development Context

## Project: AWS-to-Grafana Alert Provisioner

**Status**: Feature complete, working implementation

**Location**: `/Users/andrehansel/Desktop/claude_chats/grafana_tools/`

**Main documentation**: See `PROVISIONER.md` in project root for full architecture and usage.

## Tech Stack
- Runtime: Bun
- Language: TypeScript (strict mode)
- TUI: @clack/prompts
- AWS: @aws-sdk/client-* (v3 modular SDK)
- Config: YAML templates

## Commands
```bash
bun install          # Install deps
bun run start        # Run TUI
bun run typecheck    # Type check
bun run dev          # Watch mode
```

## Architecture Pattern
Hexagonal (ports & adapters):
- `domain/` - Pure business logic, no deps
- `ports/` - Interface contracts
- `adapters/` - Implementations (AWS SDK, Clack, filesystem, codegen)
- `application/` - Use cases orchestrating domain + ports

## Current Implementation

### Workflow (src/index.ts)
State machine with 8 steps: customer → grafana → discovery → validation → matching → customization → preview → generate

Navigation: Ctrl+C cancels, then choose Retry/Back/Exit (first step has no "back" option)

### Grafana Setup (src/adapters/inbound/cli/prompts/grafana-setup.ts)
- Connects to Grafana with API key (Service Account Token)
- Fetches and lists available data sources (CloudWatch/Prometheus)
- Handles long lists with filtering (>6 sources)
- Required step - must select at least one data source

### AWS Discovery (src/adapters/outbound/aws/)
- Credentials entered in TUI by pasting export commands
- Discovers: EC2, RDS, Lambda, ECS, EKS, ElastiCache, ALB, NLB, API Gateway, S3, SQS
- Scans all selected regions **in parallel** and merges results
- Each service has dedicated discovery file in `services/` subdirectory
- Resources include their region for proper alert grouping
- **Feature Detection**: Discovers configuration features per resource for conditional template selection

### Feature Detection During Discovery
Resources include feature flags detected from AWS API responses:
- **RDS**: `hasReadReplicas`, `isReadReplica`, `hasStorageAutoscaling`, `isAurora`, `isServerless`
- **Lambda**: `hasDlqConfigured`, `isEdgeFunction` (via GetPolicy API - checks CloudFront permissions)
- **ElastiCache**: `hasReplication`
- **ECS Cluster**: `containerInsightsEnabled` (via DescribeClusters settings)
- **ECS Service**: `hasAutoScaling`, `runningCount`, `containerInsightsEnabled` (inherited from cluster)
- **SQS**: `hasDlq`
- **S3**: `hasRequestMetrics`
- **ALB/NLB**: `targetHealth` (via DescribeTargetHealth - registeredTargetCount, healthyTargetCount, unhealthyTargetCount)

### CloudWatch Validation (src/adapters/inbound/cli/prompts/cloudwatch-validation.ts)
After discovery, validates resources against CloudWatch metrics via Grafana data source:
- Queries namespace health to distinguish permissions issues from no-activity
- Matches discovered resources to CloudWatch dimension values
- Uses verified AWS state (not guessing) to diagnose root causes
- Generates markdown report for documentation
- Filters out unvalidated resources before template matching

**Root Cause Diagnosis** (only reports what can be verified):
| Root Cause | Verification | Action |
|------------|--------------|--------|
| `permissions` | Namespace has no metrics at all | Excluded |
| `stopped_resource` | EC2 state, RDS status, ECS runningCount = 0 | Excluded |
| `config_required` | ECS containerInsightsEnabled = false, S3 hasRequestMetrics = false | Excluded |
| `edge_function` | Lambda GetPolicy confirms CloudFront permissions | Excluded |
| `no_targets` | ALB/NLB has 0 registered targets | Excluded |
| `no_activity` | Resource is active but no CloudWatch data | Excluded |
| `unknown` | Cannot verify specific cause | Excluded |

**Load Balancer Health Validation**:
| Condition | Action | Rationale |
|-----------|--------|-----------|
| 0 registered targets | **Excluded** | Monitoring is meaningless - nothing to become unhealthy |
| All targets unhealthy | **Included (Warning)** | Real problems should trigger alerts, even immediately |

The `no_targets` exclusion is based on "monitoring provides no value", not "intent was detected":
- If there are 0 targets, health alerts either show 0 (meaningless) or always fire (false positive)
- Even if it's a misconfiguration, alerting won't help - the problem is "no targets", not "unhealthy targets"

**Resource Filtering Flow**:
```
Discovery (166) → Validation (112 validated) → Template Matching (112)
```
Only validated resources get alerts created (prevents "No Data" alerts).

### Templates (templates/aws/)
YAML files define alert rules. Support both CloudWatch and Prometheus data sources.

### Output (src/adapters/outbound/codegen/)
Generates standalone TypeScript scripts with embedded Grafana client.

## Key Design Decisions
1. **No database** - File-based YAML templates, stateless operation
2. **Script output** - Human-reviewable TS files, not direct API calls
3. **Multi-region support** - Scan multiple US regions in parallel, create alerts per (template, region)
4. **In-flow credentials** - AWS and Grafana credentials entered in TUI, not required beforehand
5. **Flexible data sources** - Any combination of CloudWatch/Prometheus sources
6. **Wildcard-based alerting** - Uses `*` dimension values to monitor ALL resources of a type automatically
7. **Feature detection** - AWS discovery detects resource features to enable conditional template selection
8. **Smart defaults** - Template tiering (Core/Conditional/Needs-Tuning) reduces alert noise
9. **CloudWatch validation** - Validates resources have metrics before creating alerts, with verified root cause diagnosis
10. **Validation reports** - Generates markdown documentation of validation results for customer handoffs

## Wildcard-Based Monitoring
- CloudWatch queries use `dimensionValues: ['*']` instead of specific instance IDs
- New resources are automatically monitored without re-provisioning
- Auto-scaling groups are fully covered
- No orphaned alerts when resources are terminated
- CloudWatch returns separate time series per resource; Grafana evaluates each independently

## Alert Naming Convention
All templates follow: `{SERVICE}-Alerts-{AlertType}`
- `EC2-Alerts-Critical-CPU`
- `RDS-Alerts-Low-Storage`
- `Lambda-Alerts-Critical-Errors`
- `ALB-Alerts-Unhealthy-Hosts`

## Recent Changes
- **Load balancer target health checking**: Discovery checks target health via DescribeTargetHealth API
- **No-targets exclusion**: LBs with 0 registered targets are excluded (monitoring is meaningless)
- **Baseline unhealthy warnings**: LBs with all unhealthy targets are INCLUDED with warning (real alerts should fire)
- **Exclusion-focused reports**: Validation reports document WHY each resource was excluded with verified rationale
- **ECS running-task-count moved to Needs-Tuning**: Static threshold not useful without per-service desired count
- **CloudWatch validation step**: Validates discovered resources have CloudWatch metrics before creating alerts
- **Verified root cause diagnosis**: Only reports causes confirmed via AWS APIs (no guessing)
- **Lambda@Edge detection**: Uses GetPolicy API to check for CloudFront permissions
- **ECS Container Insights detection**: Checks cluster settings for containerInsights enabled
- **Validation report export**: Generates markdown documentation of all validation findings
- **Resource filtering**: Only validated resources proceed to template matching
- **Aurora support**: Separate Aurora templates using DBClusterIdentifier dimension
- **Feature detection**: AWS discovery now detects resource features (replicas, DLQs, auto-scaling, etc.)
- **Template tiering**: Core (always on), Conditional (feature-detected), Needs-Tuning (never auto-selected)
- **Smart defaults**: Reduces alert count by only pre-selecting relevant templates
- **Parallel region scanning**: All regions scanned simultaneously for faster discovery
- **Wildcard monitoring**: Changed from instance-specific IDs to `*` wildcards for automatic coverage
- **Consistent naming**: All alerts renamed to `{SERVICE}-Alerts-{AlertType}` format
- **Multi-region scanning**: Select multiple US regions (us-east-1, us-east-2, us-west-1, us-west-2)
- **Region-specific alerts**: CloudWatch queries are region-specific, so one alert per (template, region)
- **Delete flag**: Generated scripts support `--delete` flag to remove existing alerts before provisioning
- Added Grafana Setup step for data source selection (required)
- AWS credentials entered in TUI via pasted export commands

## Template Tiering System
Templates are organized into three tiers in `template-matching.ts`:

### Core Templates (`CORE_TEMPLATES`)
Always pre-selected - essential for detecting outages and critical failures:
- EC2: critical-cpu, status-check-failed
- RDS: critical-cpu, critical-memory, low-storage, connectivity-loss
- Lambda: critical-errors
- ECS: critical-cpu, critical-memory
- ElastiCache: critical-cpu, critical-memory-usage, connectivity-loss
- ALB/NLB: unhealthy-hosts, no-healthy-hosts, 5xx-errors
- API Gateway/S3: 5xx-errors
- SQS: age-of-oldest-message

### Conditional Templates (`CONDITIONAL_TEMPLATES`)
Auto-enabled only when feature is detected during discovery:
- `rds-critical-replica-lag` → requires `rdsHasReplicas`
- `lambda-dead-letter-errors` → requires `lambdaHasDlq`
- `elasticache-critical-replication-lag` → requires `elasticacheHasReplication`

### Needs-Tuning Templates (`TUNING_REQUIRED_TEMPLATES`)
Never pre-selected - require environment-specific baseline:
- 4xx errors (client-caused, often not actionable)
- TCP resets (need baseline)
- Evictions (acceptable levels vary)
- ECS task counts (need per-service desired count, static threshold not useful)

## Multi-Region Notes
- `Customer.regions` is now an array (was `Customer.region` string)
- `TemplateMatch` and `PendingAlert` include `region` field
- Template matcher groups resources by region, creates one match per (template, region)
- Alert titles include region suffix when multiple regions scanned: "EC2-Alerts-Critical-CPU (us-west-2)"
- **Parallel scanning**: All regions are scanned simultaneously via `Promise.all()` for faster discovery
- S3 discovery uses caching to avoid redundant bucket list/location API calls across regions
