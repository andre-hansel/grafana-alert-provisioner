# AWS Alert Templates Export

Generated: 2026-01-29

## Template Tiers

- **Core**: Always pre-selected (critical failures, outages)
- **Feature-Detected**: Auto-enabled when feature found during AWS discovery
- **Feature-Not-Detected**: Conditional template, feature not present
- **Baseline-Required**: Needs environment-specific tuning

---

## ACM

### certificate-expiring-critical.yaml

```yaml
id: acm-certificate-expiring-critical
name: "ACM-Alerts-Certificate-Expiring-Critical"
description: "Alert when any ACM certificate is expiring within 7 days"
service: acm
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/CertificateManager
    metric: DaysToExpiry
    statistic: Minimum
    dimensions:
      - CertificateArn
    period: 86400  # 24 hours

defaults:
  threshold: 7
  threshold_operator: lt
  evaluation_interval: 1h
  for_duration: 0m

labels:
  service: acm
  category: availability

annotations:
  summary: "Certificate expiring imminently for {{ $labels.resource_name }}"
  description: "ACM certificate {{ $labels.resource_name }} expires in {{ $value }} days - renew immediately"

customizable:
  - threshold
  - evaluation_interval
  - labels
  - contact_point
```

### certificate-expiring-soon.yaml

```yaml
id: acm-certificate-expiring-soon
name: "ACM-Alerts-Certificate-Expiring-Soon"
description: "Alert when any ACM certificate is expiring within 30 days"
service: acm
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/CertificateManager
    metric: DaysToExpiry
    statistic: Minimum
    dimensions:
      - CertificateArn
    period: 86400  # 24 hours

defaults:
  threshold: 30
  threshold_operator: lt
  evaluation_interval: 1h
  for_duration: 0m

labels:
  service: acm
  category: availability

annotations:
  summary: "Certificate expiring soon for {{ $labels.resource_name }}"
  description: "ACM certificate {{ $labels.resource_name }} expires in {{ $value }} days - plan renewal"

customizable:
  - threshold
  - evaluation_interval
  - labels
  - contact_point
  - severity
```

## ALB

### 5xx-errors.yaml

```yaml
id: alb-5xx-errors
name: "ALB-Alerts-5xx-Errors"
description: "Alert when any ALB is returning 5xx errors"
service: alb
severity: critical

data_sources:
  cloudwatch:
    namespace: AWS/ApplicationELB
    metric: HTTPCode_ELB_5XX_Count
    statistic: Sum
    dimensions:
      - LoadBalancer
    period: 60

defaults:
  threshold: 10
  threshold_operator: gt
  evaluation_interval: 1m
  for_duration: 5m

labels:
  service: alb
  category: errors

annotations:
  summary: "5xx errors on ALB {{ $labels.resource_name }}"
  description: "ALB {{ $labels.resource_name }} has {{ $value }} 5xx errors"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### critical-target-5xx-errors.yaml

```yaml
id: alb-critical-target-5xx-errors
name: "ALB-Alerts-Critical-Target-5xx-Errors"
description: "Alert when any ALB targets have high 5xx error rate"
service: alb
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ApplicationELB
    metric: HTTPCode_Target_5XX_Count
    statistic: Sum
    dimensions:
      - LoadBalancer
    period: 300

defaults:
  threshold: 50
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: alb
  category: errors

annotations:
  summary: "Critical target 5xx errors on ALB {{ $labels.resource_name }}"
  description: "ALB {{ $labels.resource_name }} targets returned {{ $value }} 5xx errors - high backend error rate"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### no-healthy-hosts.yaml

```yaml
id: alb-no-healthy-hosts
name: "ALB-Alerts-No-Healthy-Hosts"
description: "Alert when any ALB has no healthy targets"
service: alb
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ApplicationELB
    metric: HealthyHostCount
    statistic: Minimum
    dimensions:
      - LoadBalancer
      - TargetGroup
    period: 60

defaults:
  threshold: 0
  threshold_operator: eq
  evaluation_interval: 1m
  for_duration: 1m

labels:
  service: alb
  category: availability

annotations:
  summary: "No healthy hosts on ALB {{ $labels.resource_name }}"
  description: "ALB {{ $labels.resource_name }} has no healthy targets - service outage"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### rejected-connections.yaml

```yaml
id: alb-rejected-connections
name: "ALB-Alerts-Rejected-Connections"
description: "Alert when any ALB is rejecting connections"
service: alb
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ApplicationELB
    metric: RejectedConnectionCount
    statistic: Sum
    dimensions:
      - LoadBalancer
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: alb
  category: capacity

annotations:
  summary: "Rejected connections on ALB {{ $labels.resource_name }}"
  description: "ALB {{ $labels.resource_name }} rejected {{ $value }} connections - connection limit reached"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### unhealthy-hosts.yaml

```yaml
id: alb-unhealthy-hosts
name: "ALB-Alerts-Unhealthy-Hosts"
description: "Alert when any ALB has unhealthy target hosts"
service: alb
severity: critical

data_sources:
  cloudwatch:
    namespace: AWS/ApplicationELB
    metric: UnHealthyHostCount
    statistic: Average
    dimensions:
      - LoadBalancer
    period: 60

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 1m
  for_duration: 3m

labels:
  service: alb
  category: availability

annotations:
  summary: "Unhealthy hosts on ALB {{ $labels.resource_name }}"
  description: "ALB {{ $labels.resource_name }} has {{ $value }} unhealthy hosts"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## APIGATEWAY

### 4xx-errors.yaml

```yaml
id: apigateway-4xx-errors
name: "APIGateway-Alerts-4xx-Errors"
description: "Alert when any API Gateway is returning 4xx errors"
service: apigateway
severity: warning

data_sources:
  cloudwatch:
    namespace: AWS/ApiGateway
    metric: 4XXError
    statistic: Sum
    dimensions:
      - ApiName
    period: 300

defaults:
  threshold: 100
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 10m

labels:
  service: apigateway
  category: errors

annotations:
  summary: "4xx errors on API Gateway {{ $labels.resource_name }}"
  description: "API Gateway {{ $labels.resource_name }} has {{ $value }} 4xx errors"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-5xx-errors.yaml

```yaml
id: apigateway-critical-5xx-errors
name: "APIGateway-Alerts-Critical-5xx-Errors"
description: "Alert when any API Gateway 5XX error rate is critically high"
service: apigateway
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ApiGateway
    metric: 5XXError
    statistic: Average
    dimensions:
      - ApiName
      - Stage
    period: 300

defaults:
  threshold: 5
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: apigateway
  category: performance

annotations:
  summary: "Critical 5XX errors on API Gateway {{ $labels.resource_name }}"
  description: "API Gateway {{ $labels.resource_name }} has {{ $value }}% 5XX error rate - high error rate"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## AURORA

### blocked-transactions.yaml

```yaml
id: aurora-blocked-transactions
name: "Aurora-Alerts-Blocked-Transactions"
description: "Alert when any Aurora has blocked transactions"
service: aurora
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: BlockedTransactions
    statistic: Sum
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: aurora
  category: performance

annotations:
  summary: "Blocked transactions on Aurora {{ $labels.resource_name }}"
  description: "Aurora cluster {{ $labels.resource_name }} has {{ $value }} blocked transactions"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### connectivity-loss.yaml

```yaml
id: aurora-connectivity-loss
name: "Aurora-Alerts-Connectivity-Loss"
description: "Alert when any Aurora has zero database connections"
service: aurora
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: DatabaseConnections
    statistic: Average
    dimensions:
      - DBClusterIdentifier
    period: 60

defaults:
  threshold: 0
  threshold_operator: eq
  evaluation_interval: 1m
  for_duration: 2m

labels:
  service: aurora
  category: availability

annotations:
  summary: "Connectivity loss on Aurora {{ $labels.resource_name }}"
  description: "Aurora cluster {{ $labels.resource_name }} has zero connections - complete connectivity loss, DR trigger"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-cpu.yaml

```yaml
id: aurora-critical-cpu
name: "Aurora-Alerts-Critical-CPU-Utilization"
description: "Alert when any Aurora database CPU exceeds critical threshold"
service: aurora
severity: critical

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: CPUUtilization
    statistic: Average
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: aurora
  category: performance

annotations:
  summary: "Critical CPU on Aurora {{ $labels.resource_name }}"
  description: "Aurora cluster {{ $labels.resource_name }} CPU is {{ $value }}% - immediate scaling required"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-deadlocks.yaml

```yaml
id: aurora-critical-deadlocks
name: "Aurora-Alerts-Critical-Deadlocks"
description: "Alert when any Aurora has high deadlock rate"
service: aurora
severity: critical
priority: 3

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: Deadlocks
    statistic: Sum
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 10
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: aurora
  category: performance

annotations:
  summary: "Critical deadlocks on Aurora {{ $labels.resource_name }}"
  description: "Aurora cluster {{ $labels.resource_name }} has {{ $value }} deadlocks - review transactions"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-memory.yaml

```yaml
id: aurora-critical-memory
name: "Aurora-Alerts-Critical-Low-Memory"
description: "Alert when any Aurora memory is critically low"
service: aurora
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: FreeableMemory
    statistic: Average
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 104857600  # 100 MB in bytes
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: aurora
  category: capacity

annotations:
  summary: "Critical memory on Aurora {{ $labels.resource_name }}"
  description: "Aurora cluster {{ $labels.resource_name }} has {{ $value | humanize1024 }}B freeable memory - memory exhaustion risk"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-replica-lag.yaml

```yaml
id: aurora-critical-replica-lag
name: "Aurora-Alerts-Critical-Replica-Lag"
description: "Alert when any Aurora replica lag is severe"
service: aurora
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: AuroraReplicaLag
    statistic: Average
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 1000  # 1 second
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: aurora
  category: availability

annotations:
  summary: "Critical replica lag on Aurora {{ $labels.resource_name }}"
  description: "Aurora cluster {{ $labels.resource_name }} replica lag is {{ $value }}ms - severe replica lag"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## AUTOSCALING

### no-instances.yaml

```yaml
id: autoscaling-no-instances
name: "AutoScaling-Alerts-No-Instances-In-Service"
description: "Alert when any ASG has no instances in service"
service: autoscaling
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/AutoScaling
    metric: GroupInServiceInstances
    statistic: Minimum
    dimensions:
      - AutoScalingGroupName
    period: 60

defaults:
  threshold: 0
  threshold_operator: eq
  evaluation_interval: 1m
  for_duration: 2m

labels:
  service: autoscaling
  category: availability

annotations:
  summary: "No instances in service for ASG {{ $labels.resource_name }}"
  description: "Auto Scaling Group {{ $labels.resource_name }} has no instances in service"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## BACKUP

### copy-job-failed.yaml

```yaml
id: backup-copy-job-failed
name: "Backup-Alerts-Copy-Job-Failed"
description: "Alert when any AWS Backup copy job fails"
service: backup
severity: critical
priority: 3

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Backup
    metric: NumberOfCopyJobsFailed
    statistic: Sum
    dimensions:
      - BackupVaultName
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 0m

labels:
  service: backup
  category: availability

annotations:
  summary: "Copy job failed for {{ $labels.resource_name }}"
  description: "AWS Backup vault {{ $labels.resource_name }} has {{ $value }} failed copy jobs - cross-region/account copy failed"

customizable:
  - evaluation_interval
  - labels
  - contact_point
```

### job-failed.yaml

```yaml
id: backup-job-failed
name: "Backup-Alerts-Job-Failed"
description: "Alert when any AWS Backup job fails"
service: backup
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Backup
    metric: NumberOfBackupJobsFailed
    statistic: Sum
    dimensions:
      - BackupVaultName
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 0m

labels:
  service: backup
  category: availability

annotations:
  summary: "Backup job failed for {{ $labels.resource_name }}"
  description: "AWS Backup vault {{ $labels.resource_name }} has {{ $value }} failed backup jobs - data at risk"

customizable:
  - evaluation_interval
  - labels
  - contact_point
```

### restore-job-failed.yaml

```yaml
id: backup-restore-job-failed
name: "Backup-Alerts-Restore-Job-Failed"
description: "Alert when any AWS Backup restore job fails"
service: backup
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Backup
    metric: NumberOfRestoreJobsFailed
    statistic: Sum
    dimensions:
      - BackupVaultName
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 0m

labels:
  service: backup
  category: availability

annotations:
  summary: "Restore job failed for {{ $labels.resource_name }}"
  description: "AWS Backup vault {{ $labels.resource_name }} has {{ $value }} failed restore jobs - restore failure"

customizable:
  - evaluation_interval
  - labels
  - contact_point
```

## CLOUDFRONT

### critical-5xx-error-rate.yaml

```yaml
id: cloudfront-critical-5xx-error-rate
name: "CloudFront-Alerts-Critical-5xx-Error-Rate"
description: "Alert when any CloudFront has high origin 5xx errors"
service: cloudfront
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/CloudFront
    metric: 5xxErrorRate
    statistic: Average
    dimensions:
      - DistributionId
      - Region
    period: 300

defaults:
  threshold: 5
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: cloudfront
  category: performance

annotations:
  summary: "Critical 5xx errors on CloudFront {{ $labels.resource_name }}"
  description: "CloudFront distribution {{ $labels.resource_name }} has {{ $value }}% 5xx error rate - high origin error rate"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-error-rate.yaml

```yaml
id: cloudfront-critical-error-rate
name: "CloudFront-Alerts-Critical-Error-Rate"
description: "Alert when any CloudFront has very high error rate"
service: cloudfront
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/CloudFront
    metric: TotalErrorRate
    statistic: Average
    dimensions:
      - DistributionId
      - Region
    period: 300

defaults:
  threshold: 10
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: cloudfront
  category: performance

annotations:
  summary: "Critical error rate on CloudFront {{ $labels.resource_name }}"
  description: "CloudFront distribution {{ $labels.resource_name }} error rate is {{ $value }}% - very high error rate"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## DOCUMENTDB

### connectivity-loss.yaml

```yaml
id: documentdb-connectivity-loss
name: "DocumentDB-Alerts-Connectivity-Loss"
description: "Alert when any DocumentDB has zero connections"
service: documentdb
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/DocDB
    metric: DatabaseConnections
    statistic: Average
    dimensions:
      - DBClusterIdentifier
    period: 60

defaults:
  threshold: 0
  threshold_operator: eq
  evaluation_interval: 1m
  for_duration: 2m

labels:
  service: documentdb
  category: availability

annotations:
  summary: "Connectivity loss on DocumentDB {{ $labels.resource_name }}"
  description: "DocumentDB cluster {{ $labels.resource_name }} has zero connections - complete connectivity loss, DR trigger"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-cpu.yaml

```yaml
id: documentdb-critical-cpu
name: "DocumentDB-Alerts-Critical-CPU"
description: "Alert when any DocumentDB CPU is critical"
service: documentdb
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/DocDB
    metric: CPUUtilization
    statistic: Average
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: documentdb
  category: performance

annotations:
  summary: "Critical CPU on DocumentDB {{ $labels.resource_name }}"
  description: "DocumentDB cluster {{ $labels.resource_name }} CPU is {{ $value }}% - immediate scaling required"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-memory.yaml

```yaml
id: documentdb-critical-memory
name: "DocumentDB-Alerts-Critical-Low-Memory"
description: "Alert when any DocumentDB memory is critically low"
service: documentdb
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/DocDB
    metric: FreeableMemory
    statistic: Average
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 268435456  # 256 MB
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: documentdb
  category: capacity

annotations:
  summary: "Critical memory on DocumentDB {{ $labels.resource_name }}"
  description: "DocumentDB cluster {{ $labels.resource_name }} has {{ $value | humanize1024 }}B freeable memory - memory exhaustion risk"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### cursors-timed-out.yaml

```yaml
id: documentdb-cursors-timed-out
name: "DocumentDB-Alerts-Cursors-Timed-Out"
description: "Alert when any DocumentDB cursors are timing out"
service: documentdb
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/DocDB
    metric: DatabaseCursorsTimedOut
    statistic: Sum
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: documentdb
  category: performance

annotations:
  summary: "Cursors timing out on DocumentDB {{ $labels.resource_name }}"
  description: "DocumentDB cluster {{ $labels.resource_name }} has {{ $value }} cursors timed out - review queries"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## DYNAMODB

### system-errors.yaml

```yaml
id: dynamodb-system-errors
name: "DynamoDB-Alerts-System-Errors"
description: "Alert when any DynamoDB has system errors"
service: dynamodb
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/DynamoDB
    metric: SystemErrors
    statistic: Sum
    dimensions:
      - TableName
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: dynamodb
  category: availability

annotations:
  summary: "System errors on DynamoDB {{ $labels.resource_name }}"
  description: "DynamoDB table {{ $labels.resource_name }} has {{ $value }} system errors - DynamoDB service errors"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## EBS

### consumed-iops.yaml

```yaml
id: ebs-consumed-iops
name: "EBS-Alerts-High-Consumed-IOPS"
description: "Alert when any EBS provisioned IOPS consumption is high (io1/io2)"
service: ebs
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/EBS
    metric: VolumeConsumedReadWriteOps
    statistic: Average
    dimensions:
      - VolumeId
    period: 300

defaults:
  threshold: 80
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: ebs
  category: capacity

annotations:
  summary: "High IOPS consumption on EBS {{ $labels.resource_name }}"
  description: "EBS volume {{ $labels.resource_name }} is using {{ $value }}% of provisioned IOPS - approaching limit"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### critical-burst-balance.yaml

```yaml
id: ebs-critical-burst-balance
name: "EBS-Alerts-Critical-Burst-Balance"
description: "Alert when any EBS gp2 volume burst balance is critical"
service: ebs
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/EBS
    metric: BurstBalance
    statistic: Average
    dimensions:
      - VolumeId
    period: 300

defaults:
  threshold: 5
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: ebs
  category: capacity

annotations:
  summary: "Critical burst balance on EBS {{ $labels.resource_name }}"
  description: "EBS volume {{ $labels.resource_name }} burst balance is {{ $value }}% - performance will drop"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-queue-length.yaml

```yaml
id: ebs-critical-queue-length
name: "EBS-Alerts-Critical-Queue-Length"
description: "Alert when any EBS volume IO queue is high"
service: ebs
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/EBS
    metric: VolumeQueueLength
    statistic: Average
    dimensions:
      - VolumeId
    period: 300

defaults:
  threshold: 20
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: ebs
  category: performance

annotations:
  summary: "Critical queue length on EBS {{ $labels.resource_name }}"
  description: "EBS volume {{ $labels.resource_name }} queue length is {{ $value }} - performance degraded"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### throughput-percentage.yaml

```yaml
id: ebs-throughput-percentage
name: "EBS-Alerts-High-Throughput-Usage"
description: "Alert when any EBS throughput usage is high"
service: ebs
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/EBS
    metric: VolumeThroughputPercentage
    statistic: Average
    dimensions:
      - VolumeId
    period: 300

defaults:
  threshold: 80
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: ebs
  category: capacity

annotations:
  summary: "High throughput usage on EBS {{ $labels.resource_name }}"
  description: "EBS volume {{ $labels.resource_name }} is using {{ $value }}% of throughput - approaching limit"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## EC2

### critical-cpu.yaml

```yaml
id: ec2-critical-cpu
name: "EC2-Alerts-Critical-CPU"
description: "Alert when any EC2 instance CPU exceeds critical threshold"
service: ec2
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/EC2
    metric: CPUUtilization
    statistic: Average
    dimensions:
      - InstanceId
    period: 300

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
  description: "CPU utilization is {{ $value }}% on instance {{ $labels.resource_name }} - immediate attention required"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### status-check-failed.yaml

```yaml
id: ec2-status-check-failed
name: "EC2-Alerts-Status-Check-Failed"
description: "Alert when any EC2 instance fails status check"
service: ec2
severity: critical

data_sources:
  cloudwatch:
    namespace: AWS/EC2
    metric: StatusCheckFailed
    statistic: Maximum
    dimensions:
      - InstanceId
    period: 60

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 1m
  for_duration: 2m

labels:
  service: ec2
  category: availability

annotations:
  summary: "Status check failed on {{ $labels.instance_id }}"
  description: "EC2 instance {{ $labels.resource_name }} has failed status check"
  runbook_url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/monitoring-system-instance-status-check.html"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## ECS

### critical-cpu.yaml

```yaml
id: ecs-critical-cpu
name: "ECS-Alerts-Critical-CPU"
description: "Alert when any ECS service CPU exceeds critical threshold"
service: ecs
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ECS
    metric: CPUUtilization
    statistic: Average
    dimensions:
      - ClusterName
      - ServiceName
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: ecs
  category: performance

annotations:
  summary: "Critical CPU on ECS {{ $labels.resource_name }}"
  description: "ECS service {{ $labels.resource_name }} CPU is {{ $value }}% - immediate scaling required"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-memory.yaml

```yaml
id: ecs-critical-memory
name: "ECS-Alerts-Critical-Memory"
description: "Alert when any ECS service memory exceeds critical threshold"
service: ecs
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ECS
    metric: MemoryUtilization
    statistic: Average
    dimensions:
      - ClusterName
      - ServiceName
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: ecs
  category: capacity

annotations:
  summary: "Critical memory on ECS {{ $labels.resource_name }}"
  description: "ECS service {{ $labels.resource_name }} memory is {{ $value }}% - OOM risk"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### pending-task-count.yaml

```yaml
id: ecs-pending-task-count
name: "ECS-Alerts-Pending-Task-Count"
description: "Alert when any ECS service has tasks stuck in pending"
service: ecs
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: ECS/ContainerInsights
    metric: PendingTaskCount
    statistic: Average
    dimensions:
      - ClusterName
      - ServiceName
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: ecs
  category: availability

annotations:
  summary: "Pending tasks on ECS {{ $labels.resource_name }}"
  description: "ECS service {{ $labels.resource_name }} has {{ $value }} pending tasks - tasks stuck in pending"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### running-task-count.yaml

```yaml
id: ecs-running-task-count
name: "ECS-Alerts-Running-Task-Count-Low"
description: "Alert when any ECS service has fewer running tasks than desired"
service: ecs
severity: warning
priority: 3

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: ECS/ContainerInsights
    metric: RunningTaskCount
    statistic: Average
    dimensions:
      - ClusterName
      - ServiceName
    period: 300

defaults:
  threshold: 1  # Should be set to desired count
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: ecs
  category: availability

annotations:
  summary: "Low task count on ECS {{ $labels.resource_name }}"
  description: "ECS service {{ $labels.resource_name }} has {{ $value }} running tasks - tasks failing to run"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## EFS

### critical-burst-credits.yaml

```yaml
id: efs-critical-burst-credits
name: "EFS-Alerts-Critical-Burst-Credits"
description: "Alert when any EFS burst credits are critically low"
service: efs
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/EFS
    metric: BurstCreditBalance
    statistic: Average
    dimensions:
      - FileSystemId
    period: 300

defaults:
  threshold: 100000000  # 100 million
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: efs
  category: capacity

annotations:
  summary: "Critical burst credits on EFS {{ $labels.resource_name }}"
  description: "EFS {{ $labels.resource_name }} burst credit balance is {{ $value }} - performance will degrade"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-io-limit.yaml

```yaml
id: efs-critical-io-limit
name: "EFS-Alerts-Critical-IO-Limit"
description: "Alert when any EFS is at IO limit"
service: efs
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/EFS
    metric: PercentIOLimit
    statistic: Average
    dimensions:
      - FileSystemId
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: efs
  category: performance

annotations:
  summary: "At IO limit on EFS {{ $labels.resource_name }}"
  description: "EFS {{ $labels.resource_name }} is at {{ $value }}% of IO limit - performance degraded"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## EKS

### node-not-ready.yaml

```yaml
id: eks-node-not-ready
name: "EKS-Alerts-Node-Not-Ready"
description: "Alert when any EKS cluster has nodes in not-ready state"
service: eks
severity: critical

data_sources:
  prometheus:
    metric: kube_node_status_condition
    query: 'sum by(cluster, node) (kube_node_status_condition{condition="Ready", status="true"} == 0)'

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 1m
  for_duration: 5m

labels:
  service: eks
  category: availability

annotations:
  summary: "Node not ready in EKS cluster {{ $labels.resource_name }}"
  description: "EKS cluster {{ $labels.resource_name }} has nodes in not-ready state"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## ELASTICACHE

### connectivity-loss.yaml

```yaml
id: elasticache-connectivity-loss
name: "ElastiCache-Alerts-Connectivity-Loss"
description: "Alert when any ElastiCache has zero connections"
service: elasticache
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ElastiCache
    metric: CurrConnections
    statistic: Average
    dimensions:
      - CacheClusterId
    period: 60

defaults:
  threshold: 0
  threshold_operator: eq
  evaluation_interval: 1m
  for_duration: 2m

labels:
  service: elasticache
  category: availability

annotations:
  summary: "Connectivity loss on ElastiCache {{ $labels.resource_name }}"
  description: "ElastiCache {{ $labels.resource_name }} has zero connections - complete connectivity loss"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-cpu.yaml

```yaml
id: elasticache-critical-cpu
name: "ElastiCache-Alerts-Critical-CPU"
description: "Alert when any ElastiCache CPU exceeds critical threshold"
service: elasticache
severity: critical

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ElastiCache
    metric: CPUUtilization
    statistic: Average
    dimensions:
      - CacheClusterId
    period: 300

defaults:
  threshold: 90
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: elasticache
  category: performance

annotations:
  summary: "Critical CPU on ElastiCache {{ $labels.resource_name }}"
  description: "ElastiCache {{ $labels.resource_name }} CPU is {{ $value }}% - immediate scaling required"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-evictions.yaml

```yaml
id: elasticache-critical-evictions
name: "ElastiCache-Alerts-Critical-Evictions"
description: "Alert when any ElastiCache has high eviction rate"
service: elasticache
severity: critical

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ElastiCache
    metric: Evictions
    statistic: Sum
    dimensions:
      - CacheClusterId
    period: 300

defaults:
  threshold: 1000
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: elasticache
  category: capacity

annotations:
  summary: "Critical evictions on ElastiCache {{ $labels.resource_name }}"
  description: "ElastiCache {{ $labels.resource_name }} has {{ $value }} evictions - high eviction rate"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-memory-usage.yaml

```yaml
id: elasticache-critical-memory-usage
name: "ElastiCache-Alerts-Critical-Memory-Usage"
description: "Alert when any ElastiCache memory usage is critical"
service: elasticache
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ElastiCache
    metric: DatabaseMemoryUsagePercentage
    statistic: Average
    dimensions:
      - CacheClusterId
    period: 300

defaults:
  threshold: 90
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: elasticache
  category: capacity

annotations:
  summary: "Critical memory on ElastiCache {{ $labels.resource_name }}"
  description: "ElastiCache {{ $labels.resource_name }} memory usage is {{ $value }}% - memory exhaustion risk"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-replication-lag.yaml

```yaml
id: elasticache-critical-replication-lag
name: "ElastiCache-Alerts-Critical-Replication-Lag"
description: "Alert when any ElastiCache Redis replication lag is severe"
service: elasticache
severity: critical
priority: 3

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/ElastiCache
    metric: ReplicationLag
    statistic: Average
    dimensions:
      - CacheClusterId
    period: 300

defaults:
  threshold: 1
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: elasticache
  category: availability

annotations:
  summary: "Critical replication lag on ElastiCache {{ $labels.resource_name }}"
  description: "ElastiCache {{ $labels.resource_name }} replication lag is {{ $value }}s - severe replication lag"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## EVENTBRIDGE

### critical-failed-invocations.yaml

```yaml
id: eventbridge-critical-failed-invocations
name: "EventBridge-Alerts-Critical-Failed-Invocations"
description: "Alert when any EventBridge has high invocation failure rate"
service: eventbridge
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Events
    metric: FailedInvocations
    statistic: Sum
    dimensions:
      - RuleName
    period: 300

defaults:
  threshold: 10
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: eventbridge
  category: availability

annotations:
  summary: "Critical failed invocations for EventBridge {{ $labels.resource_name }}"
  description: "EventBridge rule {{ $labels.resource_name }} has {{ $value }} failed invocations - high event delivery failure rate"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### dead-letter-invocations.yaml

```yaml
id: eventbridge-dead-letter-invocations
name: "EventBridge-Alerts-Dead-Letter-Invocations"
description: "Alert when any EventBridge events are being sent to DLQ"
service: eventbridge
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Events
    metric: DeadLetterInvocations
    statistic: Sum
    dimensions:
      - RuleName
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: eventbridge
  category: availability

annotations:
  summary: "DLQ invocations for EventBridge {{ $labels.resource_name }}"
  description: "EventBridge rule {{ $labels.resource_name }} has {{ $value }} events sent to DLQ - events failing delivery"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## FIREHOSE

### elasticsearch-delivery-failures.yaml

```yaml
id: firehose-elasticsearch-delivery-failures
name: "Firehose-Alerts-Elasticsearch-Delivery-Failures"
description: "Alert when any Kinesis Firehose Elasticsearch delivery is failing"
service: firehose
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Firehose
    metric: DeliveryToElasticsearch.Success
    statistic: Average
    dimensions:
      - DeliveryStreamName
    period: 300

defaults:
  threshold: 100
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: firehose
  category: dr_availability

annotations:
  summary: "Elasticsearch delivery failures on Firehose {{ $labels.resource_name }}"
  description: "Kinesis Firehose {{ $labels.resource_name }} Elasticsearch delivery success is {{ $value }}%"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### redshift-delivery-failures.yaml

```yaml
id: firehose-redshift-delivery-failures
name: "Firehose-Alerts-Redshift-Delivery-Failures"
description: "Alert when any Kinesis Firehose Redshift delivery is failing"
service: firehose
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Firehose
    metric: DeliveryToRedshift.Success
    statistic: Average
    dimensions:
      - DeliveryStreamName
    period: 300

defaults:
  threshold: 100
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: firehose
  category: dr_availability

annotations:
  summary: "Redshift delivery failures on Firehose {{ $labels.resource_name }}"
  description: "Kinesis Firehose {{ $labels.resource_name }} Redshift delivery success is {{ $value }}%"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### s3-delivery-failures.yaml

```yaml
id: firehose-s3-delivery-failures
name: "Firehose-Alerts-S3-Delivery-Failures"
description: "Alert when any Kinesis Firehose S3 delivery is failing"
service: firehose
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Firehose
    metric: DeliveryToS3.Success
    statistic: Average
    dimensions:
      - DeliveryStreamName
    period: 300

defaults:
  threshold: 100
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: firehose
  category: dr_availability

annotations:
  summary: "S3 delivery failures on Firehose {{ $labels.resource_name }}"
  description: "Kinesis Firehose {{ $labels.resource_name }} S3 delivery success is {{ $value }}%"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## KINESIS

### critical-iterator-age.yaml

```yaml
id: kinesis-critical-iterator-age
name: "Kinesis-Alerts-Critical-Consumer-Lag"
description: "Alert when any Kinesis consumer lag is severe"
service: kinesis
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Kinesis
    metric: GetRecords.IteratorAgeMilliseconds
    statistic: Maximum
    dimensions:
      - StreamName
    period: 300

defaults:
  threshold: 300000  # 5 minutes
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: kinesis
  category: availability

annotations:
  summary: "Critical consumer lag on Kinesis {{ $labels.resource_name }}"
  description: "Kinesis stream {{ $labels.resource_name }} iterator age is {{ $value }}ms - severe consumer lag, data loss risk"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## LAMBDA

### critical-errors.yaml

```yaml
id: lambda-critical-errors
name: "Lambda-Alerts-Critical-Errors"
description: "Alert when any Lambda function has high error rate"
service: lambda
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Lambda
    metric: Errors
    statistic: Sum
    dimensions:
      - FunctionName
    period: 300

defaults:
  threshold: 5  # > 5% error rate approximation
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: lambda
  category: errors

annotations:
  summary: "Critical errors on Lambda {{ $labels.resource_name }}"
  description: "Lambda function {{ $labels.resource_name }} has {{ $value }} errors - high error rate"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### dead-letter-errors.yaml

```yaml
id: lambda-dead-letter-errors
name: "Lambda-Alerts-Dead-Letter-Errors"
description: "Alert when any Lambda fails to deliver to dead letter queue"
service: lambda
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Lambda
    metric: DeadLetterErrors
    statistic: Sum
    dimensions:
      - FunctionName
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: lambda
  category: availability

annotations:
  summary: "DLQ delivery failures on Lambda {{ $labels.resource_name }}"
  description: "Lambda function {{ $labels.resource_name }} failed to deliver {{ $value }} messages to DLQ"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## MQ

### critical-cpu.yaml

```yaml
id: mq-critical-cpu
name: "MQ-Alerts-Critical-CPU"
description: "Alert when any Amazon MQ broker CPU is critical"
service: mq
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/AmazonMQ
    metric: CpuUtilization
    statistic: Average
    dimensions:
      - Broker
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: mq
  category: performance

annotations:
  summary: "Critical CPU on Amazon MQ {{ $labels.resource_name }}"
  description: "Amazon MQ broker {{ $labels.resource_name }} CPU is {{ $value }}% - broker overloaded"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-heap-usage.yaml

```yaml
id: mq-critical-heap-usage
name: "MQ-Alerts-Critical-Heap-Usage"
description: "Alert when any Amazon MQ JVM heap usage is critical"
service: mq
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/AmazonMQ
    metric: HeapUsage
    statistic: Average
    dimensions:
      - Broker
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: mq
  category: capacity

annotations:
  summary: "Critical heap usage on Amazon MQ {{ $labels.resource_name }}"
  description: "Amazon MQ broker {{ $labels.resource_name }} heap usage is {{ $value }}% - memory exhaustion risk"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-store-usage.yaml

```yaml
id: mq-critical-store-usage
name: "MQ-Alerts-Critical-Store-Usage"
description: "Alert when any Amazon MQ message store is nearly full"
service: mq
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/AmazonMQ
    metric: StorePercentUsage
    statistic: Average
    dimensions:
      - Broker
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: mq
  category: capacity

annotations:
  summary: "Critical store usage on Amazon MQ {{ $labels.resource_name }}"
  description: "Amazon MQ broker {{ $labels.resource_name }} store usage is {{ $value }}% - will reject messages"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### no-consumers.yaml

```yaml
id: mq-no-consumers
name: "MQ-Alerts-No-Consumers"
description: "Alert when any Amazon MQ has no active consumers"
service: mq
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/AmazonMQ
    metric: TotalConsumerCount
    statistic: Minimum
    dimensions:
      - Broker
    period: 300

defaults:
  threshold: 0
  threshold_operator: eq
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: mq
  category: availability

annotations:
  summary: "No consumers on Amazon MQ {{ $labels.resource_name }}"
  description: "Amazon MQ broker {{ $labels.resource_name }} has no consumers - messages not being processed"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## MSK

### active-controller.yaml

```yaml
id: msk-active-controller
name: "MSK-Alerts-Active-Controller-Issue"
description: "Alert when any MSK does not have exactly one active controller"
service: msk
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Kafka
    metric: ActiveControllerCount
    statistic: Minimum
    dimensions:
      - Cluster Name
    period: 60

defaults:
  threshold: 1
  threshold_operator: neq
  evaluation_interval: 1m
  for_duration: 2m

labels:
  service: msk
  category: availability

annotations:
  summary: "Controller issue on MSK {{ $labels.resource_name }}"
  description: "MSK cluster {{ $labels.resource_name }} has {{ $value }} active controllers (expected 1) - cluster stability at risk"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-cpu.yaml

```yaml
id: msk-critical-cpu
name: "MSK-Alerts-Critical-Broker-CPU"
description: "Alert when any MSK Kafka broker CPU is critical"
service: msk
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Kafka
    metric: CpuUser
    statistic: Average
    dimensions:
      - Cluster Name
    period: 300

defaults:
  threshold: 80
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: msk
  category: performance

annotations:
  summary: "Critical CPU on MSK {{ $labels.resource_name }}"
  description: "MSK cluster {{ $labels.resource_name }} broker CPU is {{ $value }}% - brokers overloaded"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-disk-usage.yaml

```yaml
id: msk-critical-disk-usage
name: "MSK-Alerts-Critical-Disk-Usage"
description: "Alert when any MSK Kafka disk usage is critical"
service: msk
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Kafka
    metric: KafkaDataLogsDiskUsed
    statistic: Average
    dimensions:
      - Cluster Name
    period: 300

defaults:
  threshold: 85
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: msk
  category: capacity

annotations:
  summary: "Critical disk usage on MSK {{ $labels.resource_name }}"
  description: "MSK cluster {{ $labels.resource_name }} disk usage is {{ $value }}% - retention at risk"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### offline-partitions.yaml

```yaml
id: msk-offline-partitions
name: "MSK-Alerts-Offline-Partitions"
description: "Alert when any MSK has offline partitions"
service: msk
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Kafka
    metric: OfflinePartitionsCount
    statistic: Maximum
    dimensions:
      - Cluster Name
    period: 60

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 1m
  for_duration: 1m

labels:
  service: msk
  category: availability

annotations:
  summary: "Offline partitions on MSK {{ $labels.resource_name }}"
  description: "MSK cluster {{ $labels.resource_name }} has {{ $value }} offline partitions - data unavailable"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### under-replicated-partitions.yaml

```yaml
id: msk-under-replicated-partitions
name: "MSK-Alerts-Under-Replicated-Partitions"
description: "Alert when any MSK has under-replicated partitions"
service: msk
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Kafka
    metric: UnderReplicatedPartitions
    statistic: Maximum
    dimensions:
      - Cluster Name
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: msk
  category: availability

annotations:
  summary: "Under-replicated partitions on MSK {{ $labels.resource_name }}"
  description: "MSK cluster {{ $labels.resource_name }} has {{ $value }} under-replicated partitions - data durability at risk"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## NATGATEWAY

### critical-connections.yaml

```yaml
id: natgateway-critical-connections
name: "NATGateway-Alerts-Critical-Connection-Count"
description: "Alert when any NAT Gateway is near connection limit"
service: natgateway
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/NATGateway
    metric: ActiveConnectionCount
    statistic: Maximum
    dimensions:
      - NatGatewayId
    period: 300

defaults:
  threshold: 90000  # 100K max, critical at 90%
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: natgateway
  category: capacity

annotations:
  summary: "Critical connections on NAT Gateway {{ $labels.resource_name }}"
  description: "NAT Gateway {{ $labels.resource_name }} has {{ $value }} active connections - near 100K limit"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### packets-dropped.yaml

```yaml
id: natgateway-packets-dropped
name: "NATGateway-Alerts-Packets-Dropped"
description: "Alert when any NAT Gateway is dropping packets"
service: natgateway
severity: warning
priority: 3

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/NATGateway
    metric: PacketsDropCount
    statistic: Sum
    dimensions:
      - NatGatewayId
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: natgateway
  category: availability

annotations:
  summary: "Packets dropped on NAT Gateway {{ $labels.resource_name }}"
  description: "NAT Gateway {{ $labels.resource_name }} dropped {{ $value }} packets - traffic being dropped"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### port-allocation-errors.yaml

```yaml
id: natgateway-port-allocation-errors
name: "NATGateway-Alerts-Port-Allocation-Errors"
description: "Alert when any NAT Gateway has port allocation failures"
service: natgateway
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/NATGateway
    metric: ErrorPortAllocation
    statistic: Sum
    dimensions:
      - NatGatewayId
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: natgateway
  category: availability

annotations:
  summary: "Port allocation errors on NAT Gateway {{ $labels.resource_name }}"
  description: "NAT Gateway {{ $labels.resource_name }} has {{ $value }} port allocation errors - port exhaustion, scale out NAT gateways"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## NEPTUNE

### critical-cpu.yaml

```yaml
id: neptune-critical-cpu
name: "Neptune-Alerts-Critical-CPU"
description: "Alert when any Neptune database CPU is critical"
service: neptune
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Neptune
    metric: CPUUtilization
    statistic: Average
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: neptune
  category: performance

annotations:
  summary: "Critical CPU on Neptune {{ $labels.resource_name }}"
  description: "Neptune cluster {{ $labels.resource_name }} CPU is {{ $value }}% - immediate scaling required"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-memory.yaml

```yaml
id: neptune-critical-memory
name: "Neptune-Alerts-Critical-Low-Memory"
description: "Alert when any Neptune database memory is critically low"
service: neptune
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Neptune
    metric: FreeableMemory
    statistic: Average
    dimensions:
      - DBClusterIdentifier
    period: 300

defaults:
  threshold: 268435456  # 256 MB
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: neptune
  category: capacity

annotations:
  summary: "Critical memory on Neptune {{ $labels.resource_name }}"
  description: "Neptune cluster {{ $labels.resource_name }} has {{ $value | humanize1024 }}B freeable memory - memory exhaustion risk"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## NLB

### no-healthy-hosts.yaml

```yaml
id: nlb-no-healthy-hosts
name: "NLB-Alerts-No-Healthy-Hosts"
description: "Alert when any NLB has no healthy targets"
service: nlb
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/NetworkELB
    metric: HealthyHostCount
    statistic: Minimum
    dimensions:
      - LoadBalancer
      - TargetGroup
    period: 60

defaults:
  threshold: 0
  threshold_operator: eq
  evaluation_interval: 1m
  for_duration: 1m

labels:
  service: nlb
  category: availability

annotations:
  summary: "No healthy hosts on NLB {{ $labels.resource_name }}"
  description: "NLB {{ $labels.resource_name }} has no healthy targets - service outage"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### tcp-client-resets.yaml

```yaml
id: nlb-tcp-client-resets
name: "NLB-Alerts-High-Client-TCP-Resets"
description: "Alert when any NLB has high client TCP reset rate"
service: nlb
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/NetworkELB
    metric: TCP_Client_Reset_Count
    statistic: Sum
    dimensions:
      - LoadBalancer
    period: 300

defaults:
  threshold: 100
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: nlb
  category: performance

annotations:
  summary: "High client resets on NLB {{ $labels.resource_name }}"
  description: "NLB {{ $labels.resource_name }} has {{ $value }} client TCP resets - investigate connectivity"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### tcp-elb-resets.yaml

```yaml
id: nlb-tcp-elb-resets
name: "NLB-Alerts-TCP-Resets"
description: "Alert when any NLB is generating TCP resets"
service: nlb
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/NetworkELB
    metric: TCP_ELB_Reset_Count
    statistic: Sum
    dimensions:
      - LoadBalancer
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: nlb
  category: performance

annotations:
  summary: "NLB resets on {{ $labels.resource_name }}"
  description: "NLB {{ $labels.resource_name }} generated {{ $value }} TCP resets - check idle timeout"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### tcp-target-resets.yaml

```yaml
id: nlb-tcp-target-resets
name: "NLB-Alerts-High-Target-TCP-Resets"
description: "Alert when any NLB has high target TCP reset rate"
service: nlb
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/NetworkELB
    metric: TCP_Target_Reset_Count
    statistic: Sum
    dimensions:
      - LoadBalancer
    period: 300

defaults:
  threshold: 100
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: nlb
  category: performance

annotations:
  summary: "High target resets on NLB {{ $labels.resource_name }}"
  description: "NLB {{ $labels.resource_name }} has {{ $value }} target TCP resets - investigate backend"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### unhealthy-hosts.yaml

```yaml
id: nlb-unhealthy-hosts
name: "NLB-Alerts-Unhealthy-Hosts"
description: "Alert when any NLB has unhealthy targets"
service: nlb
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/NetworkELB
    metric: UnHealthyHostCount
    statistic: Maximum
    dimensions:
      - LoadBalancer
      - TargetGroup
    period: 60

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 1m
  for_duration: 2m

labels:
  service: nlb
  category: availability

annotations:
  summary: "Unhealthy hosts on NLB {{ $labels.resource_name }}"
  description: "NLB {{ $labels.resource_name }} has {{ $value }} unhealthy targets"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## RDS

### connectivity-loss.yaml

```yaml
id: rds-connectivity-loss
name: "RDS-Alerts-Connectivity-Loss"
description: "Alert when any RDS has zero database connections indicating complete connectivity loss"
service: rds
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: DatabaseConnections
    statistic: Average
    dimensions:
      - DBInstanceIdentifier
    period: 60

defaults:
  threshold: 0
  threshold_operator: eq
  evaluation_interval: 1m
  for_duration: 2m

labels:
  service: rds
  category: availability

annotations:
  summary: "Connectivity loss on RDS {{ $labels.resource_name }}"
  description: "RDS instance {{ $labels.resource_name }} has zero connections - complete connectivity loss, DR trigger"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-cpu.yaml

```yaml
id: rds-critical-cpu
name: "RDS-Alerts-Critical-CPU"
description: "Alert when any RDS instance CPU exceeds critical threshold"
service: rds
severity: critical

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: CPUUtilization
    statistic: Average
    dimensions:
      - DBInstanceIdentifier
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: rds
  category: performance

annotations:
  summary: "Critical CPU on RDS {{ $labels.resource_name }}"
  description: "RDS instance {{ $labels.resource_name }} CPU is {{ $value }}% - immediate scaling required"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-memory.yaml

```yaml
id: rds-critical-memory
name: "RDS-Alerts-Critical-Memory"
description: "Alert when any RDS instance memory is critically low"
service: rds
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: FreeableMemory
    statistic: Average
    dimensions:
      - DBInstanceIdentifier
    period: 300

defaults:
  threshold: 104857600  # 100 MB in bytes
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: rds
  category: capacity

annotations:
  summary: "Critical memory on RDS {{ $labels.resource_name }}"
  description: "RDS instance {{ $labels.resource_name }} has only {{ $value | humanize1024 }}B freeable memory - severe memory pressure"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-replica-lag.yaml

```yaml
id: rds-critical-replica-lag
name: "RDS-Alerts-Critical-Replica-Lag"
description: "Alert when any RDS read replica lag is severe"
service: rds
severity: critical
priority: 3

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/RDS
    metric: ReplicaLag
    statistic: Average
    dimensions:
      - DBInstanceIdentifier
    period: 300

defaults:
  threshold: 300  # 5 minutes
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: rds
  category: availability

annotations:
  summary: "Critical replica lag on RDS {{ $labels.resource_name }}"
  description: "RDS replica {{ $labels.resource_name }} is {{ $value }}s behind primary - severe replication lag"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### low-storage.yaml

```yaml
id: rds-low-storage
name: "RDS-Alerts-Low-Storage"
description: "Alert when any RDS instance is running low on storage"
service: rds
severity: critical

data_sources:
  cloudwatch:
    namespace: AWS/RDS
    metric: FreeStorageSpace
    statistic: Average
    dimensions:
      - DBInstanceIdentifier
    period: 300

defaults:
  threshold: 5368709120  # 5GB in bytes
  threshold_operator: lt
  evaluation_interval: 5m
  for_duration: 10m

labels:
  service: rds
  category: storage

annotations:
  summary: "Low storage on RDS {{ $labels.resource_name }}"
  description: "RDS instance {{ $labels.resource_name }} has only {{ $value | humanize1024 }}B free storage"
  runbook_url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIOPS.StorageTypes.html"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## REDSHIFT

### critical-cpu.yaml

```yaml
id: redshift-critical-cpu
name: "Redshift-Alerts-Critical-CPU"
description: "Alert when any Redshift cluster CPU is critical"
service: redshift
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Redshift
    metric: CPUUtilization
    statistic: Average
    dimensions:
      - ClusterIdentifier
    period: 300

defaults:
  threshold: 95
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: redshift
  category: performance

annotations:
  summary: "Critical CPU on Redshift {{ $labels.resource_name }}"
  description: "Redshift cluster {{ $labels.resource_name }} CPU is {{ $value }}% - cluster overloaded"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### critical-disk-usage.yaml

```yaml
id: redshift-critical-disk-usage
name: "Redshift-Alerts-Critical-Disk-Usage"
description: "Alert when any Redshift disk usage is critical"
service: redshift
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Redshift
    metric: PercentageDiskSpaceUsed
    statistic: Average
    dimensions:
      - ClusterIdentifier
    period: 300

defaults:
  threshold: 90
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: redshift
  category: capacity

annotations:
  summary: "Critical disk usage on Redshift {{ $labels.resource_name }}"
  description: "Redshift cluster {{ $labels.resource_name }} disk usage is {{ $value }}% - queries may fail"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### health-status.yaml

```yaml
id: redshift-health-status
name: "Redshift-Alerts-Unhealthy"
description: "Alert when any Redshift cluster is unhealthy"
service: redshift
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Redshift
    metric: HealthStatus
    statistic: Minimum
    dimensions:
      - ClusterIdentifier
    period: 60

defaults:
  threshold: 1
  threshold_operator: lt
  evaluation_interval: 1m
  for_duration: 1m

labels:
  service: redshift
  category: availability

annotations:
  summary: "Unhealthy Redshift {{ $labels.resource_name }}"
  description: "Redshift cluster {{ $labels.resource_name }} health status is {{ $value }} - cluster unhealthy"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### maintenance-mode.yaml

```yaml
id: redshift-maintenance-mode
name: "Redshift-Alerts-Maintenance-Mode"
description: "Alert when any Redshift cluster enters maintenance mode"
service: redshift
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Redshift
    metric: MaintenanceMode
    statistic: Maximum
    dimensions:
      - ClusterIdentifier
    period: 60

defaults:
  threshold: 1
  threshold_operator: eq
  evaluation_interval: 1m
  for_duration: 1m

labels:
  service: redshift
  category: dr_availability

annotations:
  summary: "Maintenance mode on Redshift {{ $labels.resource_name }}"
  description: "Redshift cluster {{ $labels.resource_name }} is in maintenance mode"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## ROUTE53

### connection-time.yaml

```yaml
id: route53-connection-time
name: "Route53-Alerts-Slow-Connection-Time"
description: "Alert when any Route53 health check connection time is slow"
service: route53
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Route53
    metric: ConnectionTime
    statistic: Average
    dimensions:
      - HealthCheckId
    period: 300

defaults:
  threshold: 1000
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: route53
  category: performance

annotations:
  summary: "Slow connection time on Route53 {{ $labels.resource_name }}"
  description: "Route53 health check {{ $labels.resource_name }} connection time is {{ $value }}ms - slow endpoint response"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### critical-health-check-degraded.yaml

```yaml
id: route53-critical-health-check-degraded
name: "Route53-Alerts-Critical-Health-Check-Degraded"
description: "Alert when majority of any Route53 health checks are failing"
service: route53
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Route53
    metric: HealthCheckPercentageHealthy
    statistic: Average
    dimensions:
      - HealthCheckId
    period: 60

defaults:
  threshold: 50
  threshold_operator: lt
  evaluation_interval: 1m
  for_duration: 1m

labels:
  service: route53
  category: availability

annotations:
  summary: "Critical health check failure for {{ $labels.resource_name }}"
  description: "Route53 health check {{ $labels.resource_name }} is only {{ $value }}% healthy - majority of health checks failing"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### health-check-failed.yaml

```yaml
id: route53-health-check-failed
name: "Route53-Alerts-Health-Check-Failed"
description: "Alert when any Route53 health check fails"
service: route53
severity: critical
priority: 1

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Route53
    metric: HealthCheckStatus
    statistic: Minimum
    dimensions:
      - HealthCheckId
    period: 60

defaults:
  threshold: 1
  threshold_operator: lt
  evaluation_interval: 1m
  for_duration: 1m

labels:
  service: route53
  category: availability

annotations:
  summary: "Health check failed for {{ $labels.resource_name }}"
  description: "Route53 health check {{ $labels.resource_name }} status is {{ $value }} - endpoint unhealthy"

customizable:
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### ssl-handshake-time.yaml

```yaml
id: route53-ssl-handshake-time
name: "Route53-Alerts-Slow-SSL-Handshake"
description: "Alert when any Route53 health check SSL handshake is slow"
service: route53
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Route53
    metric: SSLHandshakeTime
    statistic: Average
    dimensions:
      - HealthCheckId
    period: 300

defaults:
  threshold: 500
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: route53
  category: performance

annotations:
  summary: "Slow SSL handshake on Route53 {{ $labels.resource_name }}"
  description: "Route53 health check {{ $labels.resource_name }} SSL handshake time is {{ $value }}ms - SSL negotiation slow"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### time-to-first-byte.yaml

```yaml
id: route53-time-to-first-byte
name: "Route53-Alerts-Slow-Time-To-First-Byte"
description: "Alert when any Route53 health check time to first byte is slow"
service: route53
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/Route53
    metric: TimeToFirstByte
    statistic: Average
    dimensions:
      - HealthCheckId
    period: 300

defaults:
  threshold: 2000
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: route53
  category: performance

annotations:
  summary: "Slow time to first byte on Route53 {{ $labels.resource_name }}"
  description: "Route53 health check {{ $labels.resource_name }} time to first byte is {{ $value }}ms - slow endpoint response"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## S3

### 4xx-errors.yaml

```yaml
id: s3-4xx-errors
name: "S3-Alerts-4xx-Errors"
description: "Alert when any S3 bucket is returning 4xx errors (requires request metrics enabled)"
service: s3
severity: warning

data_sources:
  cloudwatch:
    namespace: AWS/S3
    metric: 4xxErrors
    statistic: Sum
    dimensions:
      - BucketName
    period: 300

defaults:
  threshold: 100
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 10m

labels:
  service: s3
  category: errors

annotations:
  summary: "4xx errors on S3 bucket {{ $labels.resource_name }}"
  description: "S3 bucket {{ $labels.resource_name }} has {{ $value }} 4xx errors"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### 5xx-errors.yaml

```yaml
id: s3-5xx-errors
name: "S3-Alerts-5xx-Errors"
description: "Alert when any S3 bucket is returning 5xx errors (requires request metrics enabled)"
service: s3
severity: critical

data_sources:
  cloudwatch:
    namespace: AWS/S3
    metric: 5xxErrors
    statistic: Sum
    dimensions:
      - BucketName
    period: 60

defaults:
  threshold: 10
  threshold_operator: gt
  evaluation_interval: 1m
  for_duration: 5m

labels:
  service: s3
  category: errors

annotations:
  summary: "5xx errors on S3 bucket {{ $labels.resource_name }}"
  description: "S3 bucket {{ $labels.resource_name }} has {{ $value }} 5xx errors"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## SNS

### critical-notifications-failed.yaml

```yaml
id: sns-critical-notifications-failed
name: "SNS-Alerts-Critical-Notifications-Failed"
description: "Alert when any SNS has high notification delivery failures"
service: sns
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/SNS
    metric: NumberOfNotificationsFailed
    statistic: Sum
    dimensions:
      - TopicName
    period: 300

defaults:
  threshold: 100
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: sns
  category: availability

annotations:
  summary: "Critical notifications failed for SNS {{ $labels.resource_name }}"
  description: "SNS topic {{ $labels.resource_name }} has {{ $value }} failed notifications - high delivery failure rate"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## SQS

### message-age.yaml

```yaml
id: sqs-message-age
name: "SQS-Alerts-Message-Age"
description: "Alert when messages are sitting too long in any queue"
service: sqs
severity: critical

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/SQS
    metric: ApproximateAgeOfOldestMessage
    statistic: Maximum
    dimensions:
      - QueueName
    period: 300

defaults:
  threshold: 3600  # 1 hour
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: sqs
  category: performance

annotations:
  summary: "Critical message age in SQS {{ $labels.resource_name }}"
  description: "SQS queue {{ $labels.resource_name }} oldest message is {{ $value }}s old - severe message processing delay"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

## STEPFUNCTIONS

### critical-executions-failed.yaml

```yaml
id: stepfunctions-critical-executions-failed
name: "StepFunctions-Alerts-Critical-Execution-Failures"
description: "Alert when any Step Functions has high failure rate"
service: stepfunctions
severity: critical
priority: 2

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/States
    metric: ExecutionsFailed
    statistic: Sum
    dimensions:
      - StateMachineArn
    period: 300

defaults:
  threshold: 5
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: stepfunctions
  category: performance

annotations:
  summary: "Critical failures for Step Functions {{ $labels.resource_name }}"
  description: "Step Functions {{ $labels.resource_name }} has {{ $value }} failed executions - high workflow failure rate"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
```

### executions-timed-out.yaml

```yaml
id: stepfunctions-executions-timed-out
name: "StepFunctions-Alerts-Executions-Timed-Out"
description: "Alert when any Step Functions workflow executions time out"
service: stepfunctions
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/States
    metric: ExecutionsTimedOut
    statistic: Sum
    dimensions:
      - StateMachineArn
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: stepfunctions
  category: performance

annotations:
  summary: "Executions timed out for Step Functions {{ $labels.resource_name }}"
  description: "Step Functions {{ $labels.resource_name }} has {{ $value }} timed out executions - workflows timing out"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

## TRANSITGATEWAY

### packets-dropped-blackhole.yaml

```yaml
id: transitgateway-packets-dropped-blackhole
name: "TransitGateway-Alerts-Packets-Dropped-Blackhole"
description: "Alert when any Transit Gateway drops packets due to blackhole routes"
service: transitgateway
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/TransitGateway
    metric: PacketDropCountBlackhole
    statistic: Sum
    dimensions:
      - TransitGateway
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: transitgateway
  category: availability

annotations:
  summary: "Packets dropped (blackhole) on TGW {{ $labels.resource_name }}"
  description: "Transit Gateway {{ $labels.resource_name }} dropped {{ $value }} packets due to blackhole routes - check routes"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```

### packets-dropped-no-route.yaml

```yaml
id: transitgateway-packets-dropped-no-route
name: "TransitGateway-Alerts-Packets-Dropped-No-Route"
description: "Alert when any Transit Gateway drops packets due to missing routes"
service: transitgateway
severity: warning

data_sources:
  cloudwatch:
    type: cloudwatch
    namespace: AWS/TransitGateway
    metric: PacketDropCountNoRoute
    statistic: Sum
    dimensions:
      - TransitGateway
    period: 300

defaults:
  threshold: 0
  threshold_operator: gt
  evaluation_interval: 5m
  for_duration: 5m

labels:
  service: transitgateway
  category: availability

annotations:
  summary: "Packets dropped (no route) on TGW {{ $labels.resource_name }}"
  description: "Transit Gateway {{ $labels.resource_name }} dropped {{ $value }} packets due to missing routes - check TGW config"

customizable:
  - threshold
  - evaluation_interval
  - for_duration
  - labels
  - contact_point
  - severity
```


---

## Tier Assignments Summary

### CORE (55 templates)
Always pre-selected - critical failures and outages:

```
acm-certificate-expiring-critical
alb-5xx-errors
alb-critical-target-5xx-errors
alb-no-healthy-hosts
alb-unhealthy-hosts
apigateway-critical-5xx-errors
aurora-connectivity-loss
aurora-critical-cpu
aurora-critical-memory
autoscaling-no-instances
backup-job-failed
cloudfront-critical-5xx-error-rate
documentdb-connectivity-loss
documentdb-critical-cpu
documentdb-critical-memory
dynamodb-system-errors
ebs-critical-burst-balance
ec2-critical-cpu
ec2-status-check-failed
ecs-critical-cpu
ecs-critical-memory
ecs-running-task-count
efs-critical-burst-credits
efs-critical-io-limit
eks-node-not-ready
elasticache-connectivity-loss
elasticache-critical-cpu
elasticache-critical-memory-usage
eventbridge-critical-failed-invocations
firehose-s3-delivery-failures
kinesis-critical-iterator-age
lambda-critical-errors
mq-critical-cpu
mq-critical-heap-usage
mq-critical-store-usage
mq-no-consumers
msk-critical-cpu
msk-critical-disk-usage
msk-offline-partitions
msk-under-replicated-partitions
natgateway-packets-dropped
natgateway-port-allocation-errors
neptune-critical-cpu
neptune-critical-memory
nlb-no-healthy-hosts
nlb-unhealthy-hosts
rds-connectivity-loss
rds-critical-cpu
rds-critical-memory
rds-low-storage
redshift-critical-cpu
redshift-critical-disk-usage
route53-health-check-failed
s3-5xx-errors
sns-critical-notifications-failed
sqs-message-age
stepfunctions-critical-executions-failed
transitgateway-packets-dropped-blackhole
transitgateway-packets-dropped-no-route
```

### CONDITIONAL (4 templates)
Auto-enabled when feature detected during discovery:

```
aurora-critical-replica-lag        → requires: rdsHasReplicas
elasticache-critical-replication-lag → requires: elasticacheHasReplication
lambda-dead-letter-errors          → requires: lambdaHasDlq
rds-critical-replica-lag           → requires: rdsHasReplicas
```

### BASELINE-REQUIRED (34 templates)
Never auto-selected - needs environment-specific tuning:

```
acm-certificate-expiring-soon
alb-4xx-errors
alb-rejected-connections
apigateway-4xx-errors
aurora-blocked-transactions
aurora-critical-deadlocks
backup-copy-job-failed
backup-restore-job-failed
cloudfront-critical-error-rate
documentdb-cursors-timed-out
ebs-consumed-iops
ebs-critical-queue-length
ebs-throughput-percentage
ecs-pending-task-count
elasticache-critical-evictions
eventbridge-dead-letter-invocations
firehose-elasticsearch-delivery-failures
firehose-redshift-delivery-failures
msk-active-controller
natgateway-critical-connections
nlb-tcp-client-resets
nlb-tcp-elb-resets
nlb-tcp-target-resets
redshift-health-status
redshift-maintenance-mode
route53-connection-time
route53-critical-health-check-degraded
route53-ssl-handshake-time
route53-time-to-first-byte
s3-4xx-errors
stepfunctions-executions-timed-out
```

---

## Analysis Questions

1. **Duplication**: Are there overlapping alerts that monitor the same failure mode?
2. **Actionability**: Can an on-call engineer take action based on this alert?
3. **Tier correctness**: Should any templates move between Core/Conditional/Baseline-Required?
4. **Missing coverage**: Are there critical failure modes not covered?
5. **Threshold sanity**: Are the default thresholds reasonable?

