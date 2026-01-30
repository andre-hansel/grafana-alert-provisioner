# CloudWatch Validation Report
**Customer:** Outsystems
**Generated:** January 29, 2026 at 05:51 PM EST

## Summary
- Total Discovered: 90
- Included in Monitoring: 62
- Excluded from Monitoring: 28

## Exclusions

The following resources were excluded from monitoring. Each exclusion includes 
the verified reason from AWS and the rationale for the decision.

### No CloudWatch Activity

**Rationale:** These resources exist and are in a running/active state, but have not 
generated any CloudWatch metrics. This typically means:
- Resource was recently created (metrics appear within 5 minutes of activity)
- Resource has not received any traffic/invocations
- Resource is dormant/unused

**Verified via:** CloudWatch ListMetrics/GetMetricData returned no data for these resource identifiers

**LAMBDA/US-EAST-1:**
- `outsystems-license-retrieval-customer-example`
- `os-fresh-test-license-validation-fresh`
- `delete-name-tags-us-east-1-a638-8bzzg`
- `os-fresh-test-license-retrieval-fresh`
- `outsystems-license-validation-customer-example`

**Decision:** EXCLUDED - no baseline metrics to alert on; re-validate after resource receives traffic

### Unable to Determine Cause

**Rationale:** These resources do not have CloudWatch metrics, but the specific 
cause could not be verified from AWS APIs. Manual investigation may be required.

- `fedramp-ssm-compliance-logs-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `fedramp-vpc-flow-logs-dev-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `os-fresh-test-fresh-example-bucket` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `os-fresh-test-fresh-file-storage-logs-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `os-fresh-test-fresh-s3-object-audit-trail-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `os-fresh-test-fresh-ssm-compliance-logs-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `os-fresh-test-fresh-ssm-inventory-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `os-fresh-test-fresh-vpc-flow-logs-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-customer-example-example-bucket` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-customer-example-file-storage-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-customer-example-file-storage-logs-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-customer-example-outsystems-licenses` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-customer-example-s3-object-audit-trail-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-customer-example-ssm-inventory-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-customer-example-vpc-flow-logs-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-terraform-state-logs` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-test-automation-example-bucket` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-test-automation-file-storage-logs-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-test-automation-s3-object-audit-trail-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-test-automation-ssm-compliance-logs-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-test-automation-ssm-inventory-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `outsystems-test-automation-vpc-flow-logs-291433131867` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured
- `terraform-state-knox-keeper-291433131867-us-east-1` (S3, us-east-1)
  > S3 bucket has request metrics enabled but no data - may be newly configured

**Decision:** EXCLUDED - reason unknown; investigate manually

## Exclusion Summary

| Category | Count | Rationale |
|----------|-------|-----------|
| No Activity | 5 | No traffic/invocations, no metrics yet |
| Unknown | 23 | Manual investigation required |
| **Total Excluded** | **28** | |
