# CloudWatch Validation Report
**Customer:** Celonis
**Generated:** January 29, 2026 at 05:31 PM EST

## Summary
- Total Discovered: 44
- Included in Monitoring: 28
- Excluded from Monitoring: 16
- Warnings: 1

## Warnings

The following resources are **included in monitoring** but have conditions that may 
cause alerts to fire immediately after deployment.

### Load Balancers With All Targets Unhealthy

**Verified via:** ELBv2 DescribeTargetHealth API

**Rationale:** These load balancers have registered targets but all are currently unhealthy. 
Alerts for these resources **will fire immediately** after deployment. This is intentional - 
if there is a real problem, you want to know about it.

Possible causes:
- Active outage that should be investigated
- Service intentionally scaled to zero
- Health check misconfiguration

- `celonis-alb` (ALB, us-east-1)
  - Healthy: 0, Unhealthy: 1
  - Unhealthy targets:
    - `10.1.2.125`: Target.ResponseCodeMismatch

**Decision:** INCLUDED - real problems should trigger alerts, even immediately after deployment

## Exclusions

The following resources were excluded from monitoring. Each exclusion includes 
the verified reason from AWS and the rationale for the decision.

### Configuration Required

**Rationale:** These resources require explicit AWS configuration to emit CloudWatch metrics. 
Without the required configuration, no metrics are available for alerting.

#### EKS Container Insights Not Enabled

EKS clusters require the CloudWatch agent with Container Insights addon for metrics.

- `celonis-cluster` (us-east-1)

**Decision:** EXCLUDED - no metrics available until configuration is enabled

### No CloudWatch Activity

**Rationale:** These resources exist and are in a running/active state, but have not 
generated any CloudWatch metrics. This typically means:
- Resource was recently created (metrics appear within 5 minutes of activity)
- Resource has not received any traffic/invocations
- Resource is dormant/unused

**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers

**LAMBDA/US-EAST-1:**
- `crowdstrike-cs-horizon-sensor-installation-orchestrator`
- `celonis-cpm4-bas-sqs-processor`
- `production-wks-generator-coordinator`
- `crowdstrike-RealtimeVisibilityDiscoverRegions`
- `celonis-cpm4-bas-api`
- `CrowdStrikeDSPMCreateEnvironmentLambda`

**LAMBDA/US-WEST-2:**
- `crowdstrike-hec-transform-us-west-2`

**APIGATEWAY/US-EAST-1:**
- `celonis-cpm4-bas-api`

**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic

### Unable to Determine Cause

**Rationale:** These resources do not have CloudWatch metrics, but the specific 
cause could not be verified from AWS APIs. Manual investigation may be required.

- `production-wks-generator-cluster` (ECS, us-east-1)
  > ECS resource exists but no metrics found - Container Insights may need enabling
- `celonis-457335975321-terraform-state-logs` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `terraform-state-knox-keeper-457335975321-us-east-1` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-457335975321-us-east-2` (S3, us-east-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-457335975321-us-west-1` (S3, us-west-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `bas-bas-s3-backup-logs-usw2` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `crowdstrike-hec-failed-457335975321-us-west-2` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| Config Required | 1 | AWS configuration needed for metrics |
| No Activity | 8 | No traffic/invocations, no metrics yet |
| Unknown | 7 | Manual investigation required |
| **Total Excluded** | **16** | |
