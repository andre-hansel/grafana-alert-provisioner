# CloudWatch Validation Report
**Customer:** Kovr
**Generated:** January 29, 2026 at 05:43 PM EST

## Summary
- Total Discovered: 55
- Included in Monitoring: 46
- Excluded from Monitoring: 9

## Exclusions

The following resources were excluded from monitoring. Each exclusion includes 
the verified reason from AWS and the rationale for the decision.

### Configuration Required

**Rationale:** These resources require explicit AWS configuration to emit CloudWatch metrics. 
Without the required configuration, no metrics are available for alerting.

#### EKS Container Insights Not Enabled

EKS clusters require the CloudWatch agent with Container Insights addon for metrics.

- `knox-prod-app-cluster` (us-east-2)

**Decision:** EXCLUDED - no metrics available until configuration is enabled

### No CloudWatch Activity

**Rationale:** These resources exist and are in a running/active state, but have not 
generated any CloudWatch metrics. This typically means:
- Resource was recently created (metrics appear within 5 minutes of activity)
- Resource has not received any traffic/invocations
- Resource is dormant/unused

**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers

**LAMBDA/US-EAST-1:**
- `cs-lambda-registration`

**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic

### Unable to Determine Cause

**Rationale:** These resources do not have CloudWatch metrics, but the specific 
cause could not be verified from AWS APIs. Manual investigation may be required.

- `crowdstrike-hec-failed-074597495170-us-east-1` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `terraform-state-knox-keeper-074597495170-us-east-1` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-074597495170-us-east-2` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-prod-config` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `kovr-test` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-074597495170-us-west-1` (S3, us-west-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-074597495170-us-west-2` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| Config Required | 1 | AWS configuration needed for metrics |
| No Activity | 1 | No traffic/invocations, no metrics yet |
| Unknown | 7 | Manual investigation required |
| **Total Excluded** | **9** | |
