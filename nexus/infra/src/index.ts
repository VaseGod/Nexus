// ============================================================================
// NEXUS Infrastructure — Pulumi IaC (AWS)
// ============================================================================

import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

const config = new pulumi.Config();
const projectName = 'nexus';
const environment = config.get('environment') || 'dev';

// ============================================================================
// VPC & Networking (simplified — using default VPC)
// ============================================================================

const defaultVpc = aws.ec2.getVpc({ default: true });
const defaultSubnets = aws.ec2.getSubnets({
  filters: [{ name: 'vpc-id', values: [defaultVpc.then(v => v.id)] }],
});

// ============================================================================
// ECR Repositories
// ============================================================================

const services = ['api', 'compaction-worker', 'kairos-daemon', 'aurora-controller', 'edge-server', 'ui'];

const ecrRepos: Record<string, aws.ecr.Repository> = {};
for (const service of services) {
  ecrRepos[service] = new aws.ecr.Repository(`${projectName}-${service}`, {
    name: `${projectName}/${service}`,
    imageTagMutability: 'MUTABLE',
    imageScanningConfiguration: { scanOnPush: true },
    forceDelete: true,
  });
}

// ============================================================================
// ECS Cluster
// ============================================================================

const cluster = new aws.ecs.Cluster(`${projectName}-cluster`, {
  name: `${projectName}-${environment}`,
  settings: [{ name: 'containerInsights', value: 'enabled' }],
});

// ============================================================================
// S3 Bucket — Memory & Transcripts Storage
// ============================================================================

const memoryBucket = new aws.s3.Bucket(`${projectName}-memory`, {
  bucket: `${projectName}-memory-${environment}`,
  versioning: { enabled: true },
  serverSideEncryptionConfiguration: {
    rule: {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: 'aws:kms',
      },
    },
  },
  lifecycleRules: [
    {
      enabled: true,
      noncurrentVersionTransitions: [
        { days: 30, storageClass: 'GLACIER' },
      ],
    },
  ],
});

// ============================================================================
// DynamoDB Tables
// ============================================================================

const workspaceLicenseTable = new aws.dynamodb.Table(`${projectName}-workspace-license`, {
  name: `${projectName}-WorkspaceLicense`,
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'workspaceId',
  attributes: [
    { name: 'workspaceId', type: 'S' },
  ],
  pointInTimeRecovery: { enabled: true },
});

const usageEventsTable = new aws.dynamodb.Table(`${projectName}-usage-events`, {
  name: `${projectName}-UsageEvents`,
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'workspaceId',
  rangeKey: 'timestamp',
  attributes: [
    { name: 'workspaceId', type: 'S' },
    { name: 'timestamp', type: 'S' },
  ],
  pointInTimeRecovery: { enabled: true },
});

const auditLogTable = new aws.dynamodb.Table(`${projectName}-audit-log`, {
  name: `${projectName}-AuditLog`,
  billingMode: 'PAY_PER_REQUEST',
  hashKey: 'entryId',
  rangeKey: 'timestamp',
  attributes: [
    { name: 'entryId', type: 'S' },
    { name: 'timestamp', type: 'S' },
  ],
  pointInTimeRecovery: { enabled: true },
});

// ============================================================================
// SQS Queue — Compaction Job Dispatch
// ============================================================================

const compactionQueue = new aws.sqs.Queue(`${projectName}-compaction-queue`, {
  name: `${projectName}-compaction-jobs`,
  visibilityTimeoutSeconds: 900, // 15 minutes for compaction processing
  messageRetentionSeconds: 86400, // 1 day
  deadLetterConfig: {
    targetArn: new aws.sqs.Queue(`${projectName}-compaction-dlq`, {
      name: `${projectName}-compaction-dlq`,
      messageRetentionSeconds: 1209600, // 14 days
    }).arn,
    maxReceiveCount: 3,
  },
});

// ============================================================================
// Secrets Manager
// ============================================================================

const secrets = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY'];

const secretResources: Record<string, aws.secretsmanager.Secret> = {};
for (const secretName of secrets) {
  secretResources[secretName] = new aws.secretsmanager.Secret(
    `${projectName}-${secretName.toLowerCase().replace(/_/g, '-')}`,
    {
      name: `${projectName}/${environment}/${secretName}`,
      description: `${projectName} ${secretName} for ${environment}`,
    },
  );
}

// ============================================================================
// CloudWatch Log Groups
// ============================================================================

for (const service of services) {
  new aws.cloudwatch.LogGroup(`${projectName}-${service}-logs`, {
    name: `/ecs/${projectName}/${service}`,
    retentionInDays: 30,
  });
}

// ============================================================================
// ECS Task Execution Role
// ============================================================================

const executionRole = new aws.iam.Role(`${projectName}-execution-role`, {
  name: `${projectName}-ecs-execution-${environment}`,
  assumeRolePolicy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Action: 'sts:AssumeRole',
      Principal: { Service: 'ecs-tasks.amazonaws.com' },
      Effect: 'Allow',
    }],
  }),
});

new aws.iam.RolePolicyAttachment(`${projectName}-execution-policy`, {
  role: executionRole.name,
  policyArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
});

// ============================================================================
// ECS Task Role
// ============================================================================

const taskRole = new aws.iam.Role(`${projectName}-task-role`, {
  name: `${projectName}-ecs-task-${environment}`,
  assumeRolePolicy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Action: 'sts:AssumeRole',
      Principal: { Service: 'ecs-tasks.amazonaws.com' },
      Effect: 'Allow',
    }],
  }),
});

// Grant task role access to S3, DynamoDB, SQS, Secrets Manager
new aws.iam.RolePolicy(`${projectName}-task-policy`, {
  role: taskRole.name,
  policy: pulumi.all([
    memoryBucket.arn,
    workspaceLicenseTable.arn,
    usageEventsTable.arn,
    auditLogTable.arn,
    compactionQueue.arn,
  ]).apply(([bucketArn, licenseArn, usageArn, auditArn, queueArn]) =>
    JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:GetObject', 's3:PutObject', 's3:ListBucket', 's3:DeleteObject'],
          Resource: [bucketArn, `${bucketArn}/*`],
        },
        {
          Effect: 'Allow',
          Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:Scan', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem'],
          Resource: [licenseArn, usageArn, auditArn],
        },
        {
          Effect: 'Allow',
          Action: ['sqs:SendMessage', 'sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
          Resource: queueArn,
        },
        {
          Effect: 'Allow',
          Action: ['secretsmanager:GetSecretValue'],
          Resource: '*',
        },
      ],
    }),
  ),
});

// ============================================================================
// Exports
// ============================================================================

export const clusterName = cluster.name;
export const memoryBucketName = memoryBucket.id;
export const workspaceLicenseTableName = workspaceLicenseTable.name;
export const usageEventsTableName = usageEventsTable.name;
export const auditLogTableName = auditLogTable.name;
export const compactionQueueUrl = compactionQueue.url;
export const ecrRepositories = Object.fromEntries(
  Object.entries(ecrRepos).map(([name, repo]) => [name, repo.repositoryUrl]),
);
