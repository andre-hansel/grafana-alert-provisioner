/**
 * Dashboard Service Map
 *
 * Maps AWS service types (as used in alert scripts) to their corresponding
 * dashboard template files in dashboards/templates/
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
 * Maps alert service types to dashboard templates.
 * Service types match those used in alert scripts (lowercase).
 */
export const DASHBOARD_SERVICE_MAP: Record<string, DashboardTemplate> = {
  // Core services with alerts
  alb: {
    filename: 'alb-cloudwatch-dashboard.json',
    title: 'ALB Dashboard',
    namespace: 'AWS/ApplicationELB',
    dimensionKey: 'LoadBalancer',
    variableName: 'load_balancer',
  },
  nlb: {
    filename: 'alb-cloudwatch-dashboard.json', // NLB uses ALB template (similar metrics)
    title: 'NLB Dashboard',
    namespace: 'AWS/NetworkELB',
    dimensionKey: 'LoadBalancer',
    variableName: 'load_balancer',
  },
  rds: {
    filename: 'rds-cloudwatch-dashboard.json',
    title: 'RDS Dashboard',
    namespace: 'AWS/RDS',
    dimensionKey: 'DBInstanceIdentifier',
    variableName: 'db_instance',
  },
  aurora: {
    filename: 'aurora-cloudwatch-dashboard.json',
    title: 'Aurora Dashboard',
    namespace: 'AWS/RDS',
    dimensionKey: 'DBClusterIdentifier',
    variableName: 'db_cluster',
  },
  lambda: {
    filename: 'lambda-cloudwatch-dashboard.json',
    title: 'Lambda Dashboard',
    namespace: 'AWS/Lambda',
    dimensionKey: 'FunctionName',
    variableName: 'function_name',
  },
  ec2: {
    filename: 'ec2-cloudwatch-dashboard.json',
    title: 'EC2 Dashboard',
    namespace: 'AWS/EC2',
    dimensionKey: 'InstanceId',
    variableName: 'instance_id',
  },
  ecs: {
    filename: 'ecs-cloudwatch-dashboard.json',
    title: 'ECS Dashboard',
    namespace: 'AWS/ECS',
    dimensionKey: 'ClusterName',
    variableName: 'cluster_name',
  },
  eks: {
    filename: 'eks-cloudwatch-dashboard.json',
    title: 'EKS Dashboard',
    namespace: 'AWS/EKS',
    dimensionKey: 'ClusterName',
    variableName: 'cluster_name',
  },
  elasticache: {
    filename: 'elasticache-cloudwatch-dashboard.json',
    title: 'ElastiCache Dashboard',
    namespace: 'AWS/ElastiCache',
    dimensionKey: 'CacheClusterId',
    variableName: 'cache_cluster',
  },
  apigateway: {
    filename: 'apigateway-cloudwatch-dashboard.json',
    title: 'API Gateway Dashboard',
    namespace: 'AWS/ApiGateway',
    dimensionKey: 'ApiName',
    variableName: 'api_name',
  },
  'apigateway-websocket': {
    filename: 'apigateway-websocket-cloudwatch-dashboard.json',
    title: 'API Gateway WebSocket Dashboard',
    namespace: 'AWS/ApiGateway',
    dimensionKey: 'ApiId',
    variableName: 'api_id',
  },
  s3: {
    filename: 's3-cloudwatch-dashboard.json',
    title: 'S3 Dashboard',
    namespace: 'AWS/S3',
    dimensionKey: 'BucketName',
    variableName: 'bucket_name',
  },
  sqs: {
    filename: 'sqs-cloudwatch-dashboard.json',
    title: 'SQS Dashboard',
    namespace: 'AWS/SQS',
    dimensionKey: 'QueueName',
    variableName: 'queue_name',
  },
  sns: {
    filename: 'sns-cloudwatch-dashboard.json',
    title: 'SNS Dashboard',
    namespace: 'AWS/SNS',
    dimensionKey: 'TopicName',
    variableName: 'topic_name',
  },
  dynamodb: {
    filename: 'dynamodb-cloudwatch-dashboard.json',
    title: 'DynamoDB Dashboard',
    namespace: 'AWS/DynamoDB',
    dimensionKey: 'TableName',
    variableName: 'table_name',
  },
  cloudfront: {
    filename: 'cloudfront-cloudwatch-dashboard.json',
    title: 'CloudFront Dashboard',
    namespace: 'AWS/CloudFront',
    dimensionKey: 'DistributionId',
    variableName: 'distribution_id',
  },
  efs: {
    filename: 'efs-cloudwatch-dashboard.json',
    title: 'EFS Dashboard',
    namespace: 'AWS/EFS',
    dimensionKey: 'FileSystemId',
    variableName: 'file_system_id',
  },
  fsx: {
    filename: 'fsx-cloudwatch-dashboard.json',
    title: 'FSx Dashboard',
    namespace: 'AWS/FSx',
    dimensionKey: 'FileSystemId',
    variableName: 'file_system_id',
  },
  natgateway: {
    filename: 'natgateway-cloudwatch-dashboard.json',
    title: 'NAT Gateway Dashboard',
    namespace: 'AWS/NATGateway',
    dimensionKey: 'NatGatewayId',
    variableName: 'nat_gateway_id',
  },
  redshift: {
    filename: 'redshift-cloudwatch-dashboard.json',
    title: 'Redshift Dashboard',
    namespace: 'AWS/Redshift',
    dimensionKey: 'ClusterIdentifier',
    variableName: 'cluster_id',
  },
  documentdb: {
    filename: 'documentdb-cloudwatch-dashboard.json',
    title: 'DocumentDB Dashboard',
    namespace: 'AWS/DocDB',
    dimensionKey: 'DBClusterIdentifier',
    variableName: 'db_cluster',
  },
  eventbridge: {
    filename: 'eventbridge-cloudwatch-dashboard.json',
    title: 'EventBridge Dashboard',
    namespace: 'AWS/Events',
    dimensionKey: 'RuleName',
    variableName: 'rule_name',
  },
  waf: {
    filename: 'waf-cloudwatch-dashboard.json',
    title: 'WAF Dashboard',
    namespace: 'AWS/WAFV2',
    dimensionKey: 'WebACL',
    variableName: 'web_acl',
  },
  route53: {
    filename: 'route53-cloudwatch-dashboard.json',
    title: 'Route 53 Dashboard',
    namespace: 'AWS/Route53',
    dimensionKey: 'HealthCheckId',
    variableName: 'health_check_id',
  },
  acm: {
    filename: 'acm-cloudwatch-dashboard.json',
    title: 'ACM Dashboard',
    namespace: 'AWS/CertificateManager',
    dimensionKey: 'CertificateArn',
    variableName: 'certificate_arn',
  },
  autoscaling: {
    filename: 'autoscaling-cloudwatch-dashboard.json',
    title: 'Auto Scaling Dashboard',
    namespace: 'AWS/AutoScaling',
    dimensionKey: 'AutoScalingGroupName',
    variableName: 'asg_name',
  },
  backup: {
    filename: 'backup-cloudwatch-dashboard.json',
    title: 'AWS Backup Dashboard',
    namespace: 'AWS/Backup',
    dimensionKey: 'BackupVaultName',
    variableName: 'vault_name',
  },
};

/**
 * Get dashboard template for a service type.
 * Returns undefined if no template exists for the service.
 */
export function getDashboardTemplate(serviceType: string): DashboardTemplate | undefined {
  return DASHBOARD_SERVICE_MAP[serviceType.toLowerCase()];
}

/**
 * Get all available dashboard templates.
 */
export function getAllDashboardTemplates(): Array<{ service: string; template: DashboardTemplate }> {
  return Object.entries(DASHBOARD_SERVICE_MAP).map(([service, template]) => ({
    service,
    template,
  }));
}

/**
 * Services that have alert templates but no dedicated dashboard template.
 * These will be flagged as gaps during provisioning.
 */
export const SERVICES_WITHOUT_DASHBOARDS: string[] = [
  // Currently all major services have dashboards
  // Add any gaps here as they're identified
];

/**
 * Maps dimension keys found in alert scripts to service types.
 * Used to detect service type from alert script parsing.
 */
export const DIMENSION_TO_SERVICE: Record<string, string> = {
  LoadBalancer: 'alb', // Could be ALB or NLB, need namespace to distinguish
  DBInstanceIdentifier: 'rds',
  DBClusterIdentifier: 'aurora',
  FunctionName: 'lambda',
  InstanceId: 'ec2',
  ClusterName: 'ecs', // Could be ECS or EKS, need namespace to distinguish
  CacheClusterId: 'elasticache',
  ApiName: 'apigateway',
  ApiId: 'apigateway-websocket',
  BucketName: 's3',
  QueueName: 'sqs',
  TopicName: 'sns',
  TableName: 'dynamodb',
  DistributionId: 'cloudfront',
  FileSystemId: 'efs', // Could be EFS or FSx, need namespace to distinguish
  NatGatewayId: 'natgateway',
  ClusterIdentifier: 'redshift',
  RuleName: 'eventbridge',
  WebACL: 'waf',
  HealthCheckId: 'route53',
  CertificateArn: 'acm',
  AutoScalingGroupName: 'autoscaling',
  BackupVaultName: 'backup',
};

/**
 * Maps CloudWatch namespaces to service types.
 * Used to disambiguate services that share dimension keys.
 */
export const NAMESPACE_TO_SERVICE: Record<string, string> = {
  'AWS/ApplicationELB': 'alb',
  'AWS/NetworkELB': 'nlb',
  'AWS/RDS': 'rds', // Could also be aurora
  'AWS/Lambda': 'lambda',
  'AWS/EC2': 'ec2',
  'AWS/ECS': 'ecs',
  'AWS/EKS': 'eks',
  'AWS/ElastiCache': 'elasticache',
  'AWS/ApiGateway': 'apigateway',
  'AWS/S3': 's3',
  'AWS/SQS': 'sqs',
  'AWS/SNS': 'sns',
  'AWS/DynamoDB': 'dynamodb',
  'AWS/CloudFront': 'cloudfront',
  'AWS/EFS': 'efs',
  'AWS/FSx': 'fsx',
  'AWS/NATGateway': 'natgateway',
  'AWS/Redshift': 'redshift',
  'AWS/DocDB': 'documentdb',
  'AWS/Events': 'eventbridge',
  'AWS/WAFV2': 'waf',
  'AWS/Route53': 'route53',
  'AWS/CertificateManager': 'acm',
  'AWS/AutoScaling': 'autoscaling',
  'AWS/Backup': 'backup',
};
