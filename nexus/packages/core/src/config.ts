// ============================================================================
// Configuration — fail-fast validation with env-var
// ============================================================================

import { from } from 'env-var';

const env = from(process.env);

export interface NexusConfig {
  readonly anthropicApiKey: string;
  readonly openaiApiKey: string;
  readonly stripeSecretKey: string;
  readonly stripeWebhookSecret: string;
  readonly edgeModelPath: string;
  readonly ultraplanThreshold: number;
  readonly memoryBasePath: string;
  readonly lanceDbPath: string;
  readonly apiPort: number;
  readonly apiHost: string;
  readonly jwtSecret: string;
  readonly compactionIntervalMinutes: number;
  readonly compactionWorkerUrl: string;
  readonly auroraControllerUrl: string;
  readonly draftModelPath: string;
  readonly targetModelPath: string;
  readonly auroraDraftK: number;
  readonly auroraTrainingInterval: number;
  readonly edgeServerUrl: string;
  readonly slackBotToken: string;
  readonly slackSigningSecret: string;
  readonly githubWebhookSecret: string;
  readonly awsRegion: string;
  readonly dynamoDbEndpoint: string;
}

export function loadConfig(): NexusConfig {
  return {
    anthropicApiKey: env.get('ANTHROPIC_API_KEY').required().asString(),
    openaiApiKey: env.get('OPENAI_API_KEY').required().asString(),
    stripeSecretKey: env.get('STRIPE_SECRET_KEY').required().asString(),
    stripeWebhookSecret: env.get('STRIPE_WEBHOOK_SECRET').required().asString(),
    edgeModelPath: env.get('EDGE_MODEL_PATH').default('/models/ternary-1bit.gguf').asString(),
    ultraplanThreshold: env.get('ULTRAPLAN_THRESHOLD').default('0.4').asFloatPositive(),
    memoryBasePath: env.get('MEMORY_BASE_PATH').default('./memory').asString(),
    lanceDbPath: env.get('LANCEDB_PATH').default('./memory/vectors').asString(),
    apiPort: env.get('API_PORT').default('3000').asPortNumber(),
    apiHost: env.get('API_HOST').default('0.0.0.0').asString(),
    jwtSecret: env.get('JWT_SECRET').required().asString(),
    compactionIntervalMinutes: env.get('COMPACTION_INTERVAL_MINUTES').default('30').asIntPositive(),
    compactionWorkerUrl: env.get('COMPACTION_WORKER_URL').default('http://localhost:8001').asString(),
    auroraControllerUrl: env.get('AURORA_CONTROLLER_URL').default('http://localhost:8002').asString(),
    draftModelPath: env.get('DRAFT_MODEL_PATH').default('/models/draft-model.gguf').asString(),
    targetModelPath: env.get('TARGET_MODEL_PATH').default('/models/target-model.gguf').asString(),
    auroraDraftK: env.get('AURORA_DRAFT_K').default('5').asIntPositive(),
    auroraTrainingInterval: env.get('AURORA_TRAINING_INTERVAL').default('500').asIntPositive(),
    edgeServerUrl: env.get('EDGE_SERVER_URL').default('http://localhost:8003').asString(),
    slackBotToken: env.get('SLACK_BOT_TOKEN').default('').asString(),
    slackSigningSecret: env.get('SLACK_SIGNING_SECRET').default('').asString(),
    githubWebhookSecret: env.get('GITHUB_WEBHOOK_SECRET').default('').asString(),
    awsRegion: env.get('AWS_REGION').default('us-east-1').asString(),
    dynamoDbEndpoint: env.get('DYNAMODB_ENDPOINT').default('http://localhost:8000').asString(),
  };
}
