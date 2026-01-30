# CloudWatch Validation Report
**Customer:** Emburse
**Generated:** January 29, 2026 at 05:25 PM EST

## Summary
- Total Discovered: 315
- Included in Monitoring: 275
- Excluded from Monitoring: 40
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

- `c4-ops-internal-alb` (ALB, us-east-1)
  - Healthy: 0, Unhealthy: 2
  - Unhealthy targets:
    - `i-01add0589797a9e1f`: Target.FailedHealthChecks
    - `i-064f8c9d4cf66b27e`: Target.FailedHealthChecks

**Decision:** INCLUDED - real problems should trigger alerts, even immediately after deployment

## Exclusions

The following resources were excluded from monitoring. Each exclusion includes 
the verified reason from AWS and the rationale for the decision.

### Configuration Required

**Rationale:** These resources require explicit AWS configuration to emit CloudWatch metrics. 
Without the required configuration, no metrics are available for alerting.

#### EKS Container Insights Not Enabled

EKS clusters require the CloudWatch agent with Container Insights addon for metrics.

- `chromeriver-c4dev` (us-west-2)

**Decision:** EXCLUDED - no metrics available until configuration is enabled

### Load Balancers With No Targets

**Verified via:** ELBv2 DescribeTargetHealth API

**Rationale:** These load balancers have no targets registered. This typically indicates:
- Infrastructure reserved for future use
- Target group not yet attached to ASG/ECS service
- Deprecated infrastructure pending decommission

There is nothing to become unhealthy, so health-based alerts would be meaningless.

- `c4-ops-alb` (ALB, us-east-1)
  - Target Groups: 0, Registered Targets: 0
- `cX-dev-router-alb` (ALB, us-west-2)
  - Target Groups: 1, Registered Targets: 0
- `c4-dev-internal-alb` (ALB, us-west-2)
  - Target Groups: 0, Registered Targets: 0
- `c4-dev-external-alb` (ALB, us-west-2)
  - Target Groups: 0, Registered Targets: 0

**Decision:** EXCLUDED - no targets to become unhealthy

### No CloudWatch Activity

**Rationale:** These resources exist and are in a running/active state, but have not 
generated any CloudWatch metrics. This typically means:
- Resource was recently created (metrics appear within 5 minutes of activity)
- Resource has not received any traffic/invocations
- Resource is dormant/unused

**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers

**LAMBDA/US-EAST-1:**
- `cs-lambda-registration`

**LAMBDA/US-WEST-2:**
- `travel-subscriber-cX-dev`
- `datadog-ec2-agent-installer-cleanup`
- `chromeriver-cxdev-coralogixforwarder-logs`
- `chromeriver-c4dev-coralogixforwarder-logs`
- `receipts-consumer-cX-dev`
- `chromeriver-c4dev-coralogixforwarder-metadata`
- `travel-configs-cX-dev`
- `travel-line-item-merger-c4-dev`
- `receipt-configs-cX-dev`
- `vat-autobot-c4-dev`

**APIGATEWAY/US-WEST-2:**
- `expense-open-reports-c4-dev`
- `receipt-configs-cX-dev`
- `dpss-webhook-router-cX-dev`
- `travel-configs-cX-dev`
- `chromeriver-c4dev-invoiceert-ext`

**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic

### Unable to Determine Cause

**Rationale:** These resources do not have CloudWatch metrics, but the specific 
cause could not be verified from AWS APIs. Manual investigation may be required.

- `chromeriver-c4ops-tessera-dev` (RDS, us-east-1)
  > Aurora cluster is available - verify DBClusterIdentifier dimension is being queried
- `chromeriver-c4ops-tessera-dev00` (RDS, us-east-1)
  > RDS instance is available but no metrics found - may be newly created
- `chromeriver-c4ops-tessera-dev01` (RDS, us-east-1)
  > RDS instance is available but no metrics found - may be newly created
- `chromeriver-c4ops-tessera-dev02` (RDS, us-east-1)
  > RDS instance is available but no metrics found - may be newly created
- `prod-emburse-fedramp-logs-830424059346` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `cr-tessera-validation-int-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-chromeriver-accesslogs-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-chromeriver-batch-links-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-chromeriver-deploy-int-c4-prod` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-chromeriver-downloadcenter-ext-c4-all` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-chromeriver-folioreceiptgenerator-int-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-chromeriver-metis-props-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-chromeriver-search-int-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-chromeriver-transactionfeedapp-int-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-chromeriver-vendor-int-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-cr-butler-expense-xml-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-cr-butler-images-pa-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-cr-butler-images-po-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `knox-cr-emailer-attachments-c4-dev` (S3, us-west-2)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| Config Required | 1 | AWS configuration needed for metrics |
| No Targets | 4 | Load balancer has no registered targets |
| No Activity | 16 | No traffic/invocations, no metrics yet |
| Unknown | 19 | Manual investigation required |
| **Total Excluded** | **40** | |
