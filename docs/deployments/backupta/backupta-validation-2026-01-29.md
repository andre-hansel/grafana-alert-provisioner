# CloudWatch Validation Report
**Customer:** Backupta
**Generated:** January 29, 2026 at 05:16 PM EST

## Summary
- Total Discovered: 73
- Included in Monitoring: 52
- Excluded from Monitoring: 21

## Exclusions

The following resources were excluded from monitoring. Each exclusion includes 
the verified reason from AWS and the rationale for the decision.

### Configuration Required

**Rationale:** These resources require explicit AWS configuration to emit CloudWatch metrics. 
Without the required configuration, no metrics are available for alerting.

#### ECS Container Insights Not Enabled

**Verified via:** ECS DescribeClusters API (settings.containerInsights)

ECS clusters require Container Insights to emit CPU/Memory metrics. Enable via:
`aws ecs update-cluster-settings --cluster <name> --settings name=containerInsights,value=enabled`

- `alloy-profiling` on cluster `backupta` (us-east-1)

**Decision:** EXCLUDED - no metrics available until configuration is enabled

### No CloudWatch Activity

**Rationale:** These resources exist and are in a running/active state, but have not 
generated any CloudWatch metrics. This typically means:
- Resource was recently created (metrics appear within 5 minutes of activity)
- Resource has not received any traffic/invocations
- Resource is dormant/unused

**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers

**LAMBDA/US-EAST-1:**
- `object-storage-siem-knox-medium`
- `rth-log-preprocessor`
- `scheduler-hook`
- `knox-medium-opensearch-autoscale`
- `rth-alert-handler`
- `rth-dynamodb-writer`
- `cs-horizon-sensor-installation-orchestrator`
- `rth-entity-provider`
- `CrowdStrikeDSPMCreateEnvironmentLambda`
- `RealtimeVisibilityDiscoverRegions`
- `rth-alert-preprocessor`
- `processor-tasks`
- `rth-opensearch-writer`

**LAMBDA/US-EAST-2:**
- `crowdstrike-hec-transform-us-east-2`

**LAMBDA/US-WEST-1:**
- `crowdstrike-hec-transform-us-west-1`

**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic

### Unable to Determine Cause

**Rationale:** These resources do not have CloudWatch metrics, but the specific 
cause could not be verified from AWS APIs. Manual investigation may be required.

- `backupta` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `backupta-log-archive-knox` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `fedramp-high-terraform-logs-prod-b828c132` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-296601444426-us-east-2` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-296601444426-us-west-1` (S3, us-west-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| Config Required | 1 | AWS configuration needed for metrics |
| No Activity | 15 | No traffic/invocations, no metrics yet |
| Unknown | 5 | Manual investigation required |
| **Total Excluded** | **21** | |
