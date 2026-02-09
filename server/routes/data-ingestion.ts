/**
 * Unified Data Ingestion API Route
 *
 * Single endpoint for all non-file data source ingestion:
 * - Databases: PostgreSQL, MySQL, MongoDB
 * - APIs: REST, GraphQL
 * - Web Scraping: Cheerio + Puppeteer
 * - Cloud Storage: AWS S3, Azure Blob, Google Cloud Storage
 * - Streaming: WebSocket
 *
 * All sources flow through ComprehensiveDataIngestion service,
 * then create a dataset and link it to the project.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ensureAuthenticated } from './auth';
import { storage } from '../services/storage';
import { PIIAnalyzer } from '../pii-analyzer';
import {
  dataIngestion,
  IngestionResult,
  DatabaseConfig,
  MongoDBConfig,
  GraphQLConfig,
  WebScrapingConfig,
  CloudStorageConfig,
  StreamingConfig,
} from '../services/comprehensive-data-ingestion';

const router = Router();

// ============================================================================
// Request Validation Schemas
// ============================================================================

const PostgreSQLSchema = z.object({
  sourceType: z.literal('postgresql'),
  projectId: z.string().min(1),
  config: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string(),
    query: z.string().min(1),
    ssl: z.boolean().optional(),
  }),
  label: z.string().optional(),
});

const MySQLSchema = z.object({
  sourceType: z.literal('mysql'),
  projectId: z.string().min(1),
  config: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string(),
    query: z.string().min(1),
    ssl: z.boolean().optional(),
  }),
  label: z.string().optional(),
});

const MongoDBSchema = z.object({
  sourceType: z.literal('mongodb'),
  projectId: z.string().min(1),
  config: z.object({
    connectionString: z.string().min(1),
    database: z.string().min(1),
    collection: z.string().min(1),
    query: z.any().optional(),
    projection: z.any().optional(),
    limit: z.number().int().min(1).max(100000).optional(),
  }),
  label: z.string().optional(),
});

const RestAPISchema = z.object({
  sourceType: z.literal('rest_api'),
  projectId: z.string().min(1),
  config: z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST']).optional().default('GET'),
    headers: z.record(z.string()).optional(),
    body: z.any().optional(),
    auth: z.object({
      type: z.enum(['bearer', 'basic']),
      token: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    }).optional(),
  }),
  label: z.string().optional(),
});

const GraphQLSchema = z.object({
  sourceType: z.literal('graphql'),
  projectId: z.string().min(1),
  config: z.object({
    endpoint: z.string().url(),
    query: z.string().min(1),
    variables: z.record(z.any()).optional(),
    headers: z.record(z.string()).optional(),
    auth: z.object({
      type: z.enum(['bearer', 'api_key']),
      token: z.string().optional(),
      apiKeyHeader: z.string().optional(),
      apiKeyValue: z.string().optional(),
    }).optional(),
  }),
  label: z.string().optional(),
});

const WebScrapingSchema = z.object({
  sourceType: z.literal('web_scraping'),
  projectId: z.string().min(1),
  config: z.object({
    url: z.string().url(),
    selector: z.string().optional(),
    waitFor: z.string().optional(),
    javascript: z.boolean().optional().default(false),
    headers: z.record(z.string()).optional(),
    pagination: z.object({
      enabled: z.boolean(),
      nextSelector: z.string().optional(),
      maxPages: z.number().int().min(1).max(100).optional(),
    }).optional(),
  }),
  label: z.string().optional(),
});

const CloudStorageSchema = z.object({
  sourceType: z.literal('cloud_storage'),
  projectId: z.string().min(1),
  config: z.object({
    provider: z.enum(['aws', 'azure', 'gcp']),
    credentials: z.any(),
    bucket: z.string().optional(),
    container: z.string().optional(),
    filePath: z.string().min(1),
  }),
  label: z.string().optional(),
});

const WebSocketSchema = z.object({
  sourceType: z.literal('websocket'),
  projectId: z.string().min(1),
  config: z.object({
    url: z.string().min(1),
    auth: z.record(z.string()).optional(),
    maxMessages: z.number().int().min(1).max(10000).optional().default(100),
    timeout: z.number().int().min(1000).max(120000).optional().default(30000),
  }),
  label: z.string().optional(),
});

const IngestRequestSchema = z.discriminatedUnion('sourceType', [
  PostgreSQLSchema,
  MySQLSchema,
  MongoDBSchema,
  RestAPISchema,
  GraphQLSchema,
  WebScrapingSchema,
  CloudStorageSchema,
  WebSocketSchema,
]);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map source type to dataset sourceType field value
 */
function mapToDatasetSourceType(sourceType: string): string {
  const mapping: Record<string, string> = {
    postgresql: 'database',
    mysql: 'database',
    mongodb: 'database',
    rest_api: 'api',
    graphql: 'api',
    web_scraping: 'web',
    cloud_storage: 'cloud',
    websocket: 'streaming',
  };
  return mapping[sourceType] || 'api';
}

/**
 * Infer data type based on source
 */
function inferDataType(sourceType: string): string {
  if (sourceType === 'websocket') return 'timeseries';
  if (sourceType === 'web_scraping') return 'tabular';
  return 'tabular';
}

/**
 * Strip credentials from config for safe storage.
 * Only non-sensitive display info is persisted in ingestionMetadata.
 */
function sanitizeConfigForStorage(sourceType: string, config: any): any {
  switch (sourceType) {
    case 'postgresql':
    case 'mysql':
      return { host: config.host, port: config.port, database: config.database, query: config.query };
    case 'mongodb':
      return { database: config.database, collection: config.collection };
    case 'rest_api':
      return { url: config.url, method: config.method || 'GET' };
    case 'graphql':
      return { endpoint: config.endpoint };
    case 'web_scraping':
      return { url: config.url, selector: config.selector };
    case 'cloud_storage':
      return { provider: config.provider, bucket: config.bucket || config.container, filePath: config.filePath };
    case 'websocket':
      return { url: config.url };
    default:
      return {};
  }
}

// ============================================================================
// Main Ingestion Endpoint
// ============================================================================

router.post('/ingest', ensureAuthenticated, async (req: Request, res: Response) => {
  const userId = (req.user as any)?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  // Validate request body
  const parsed = IngestRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    });
  }

  const { sourceType, projectId, config, label } = parsed.data;

  // Verify project ownership
  const project = await storage.getProject(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }
  if ((project as any).userId !== userId) {
    const isAdmin = (req.user as any)?.isAdmin || false;
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
  }

  console.log(`📥 [DataIngestion] Starting ${sourceType} ingestion for project ${projectId}`);
  const startTime = Date.now();

  try {
    // Route to appropriate ingestion method
    let result: IngestionResult;

    switch (sourceType) {
      case 'postgresql':
        result = await dataIngestion.ingestPostgreSQL(config as DatabaseConfig);
        break;

      case 'mysql':
        result = await dataIngestion.ingestMySQL(config as DatabaseConfig);
        break;

      case 'mongodb':
        result = await dataIngestion.ingestMongoDB(config as MongoDBConfig);
        break;

      case 'rest_api': {
        const apiConfig = config as z.infer<typeof RestAPISchema>['config'];
        result = await dataIngestion.ingestAPI(apiConfig.url, {
          method: apiConfig.method,
          headers: apiConfig.headers,
          body: apiConfig.body,
          auth: apiConfig.auth,
        });
        break;
      }

      case 'graphql':
        result = await dataIngestion.ingestGraphQL(config as GraphQLConfig);
        break;

      case 'web_scraping': {
        const scrapingConfig = config as z.infer<typeof WebScrapingSchema>['config'];
        result = await dataIngestion.ingestWebScraping(scrapingConfig as WebScrapingConfig);
        break;
      }

      case 'cloud_storage': {
        const cloudConfig = config as z.infer<typeof CloudStorageSchema>['config'];
        const csConfig: CloudStorageConfig = {
          provider: cloudConfig.provider,
          credentials: cloudConfig.credentials,
          bucket: cloudConfig.bucket,
          container: cloudConfig.container,
          filePath: cloudConfig.filePath,
        };
        if (cloudConfig.provider === 'aws') {
          result = await dataIngestion.ingestAWSS3(csConfig);
        } else if (cloudConfig.provider === 'azure') {
          result = await dataIngestion.ingestAzureBlob(csConfig);
        } else {
          result = await dataIngestion.ingestGoogleCloudStorage(csConfig);
        }
        break;
      }

      case 'websocket': {
        const wsConfig = config as z.infer<typeof WebSocketSchema>['config'];
        result = await dataIngestion.ingestStreaming({
          type: 'websocket',
          url: wsConfig.url,
          auth: wsConfig.auth,
          maxMessages: wsConfig.maxMessages,
          timeout: wsConfig.timeout,
        } as StreamingConfig);
        break;
      }

      default:
        return res.status(400).json({ success: false, error: `Unknown source type: ${sourceType}` });
    }

    if (!result.success || !result.data || result.data.length === 0) {
      console.error(`❌ [DataIngestion] ${sourceType} ingestion failed:`, result.error);
      return res.status(422).json({
        success: false,
        error: result.error || 'Ingestion returned no data',
        sourceType,
      });
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [DataIngestion] ${sourceType} ingestion completed: ${result.recordCount} records in ${duration}ms`);

    // Run PII analysis
    const previewRows = result.data.slice(0, 50);
    const piiAnalysis = await PIIAnalyzer.analyzePII(previewRows, result.schema || {});

    // Create dataset
    const displayName = label || `${sourceType}_${Date.now()}`;
    const dataset = await storage.createDataset({
      userId,
      sourceType: mapToDatasetSourceType(sourceType),
      originalFileName: displayName,
      mimeType: 'application/json',
      fileSize: result.metadata?.dataSize || 0,
      storageUri: `ingestion://${sourceType}/${result.metadata?.source || 'unknown'}`,
      schema: result.schema || {},
      recordCount: result.recordCount || result.data.length,
      preview: result.data.slice(0, 20),
      data: result.data,
      piiAnalysis,
      dataType: inferDataType(sourceType),
      mode: sourceType === 'websocket' ? 'stream' : 'static',
      ingestionMetadata: {
        sourceType,
        source: result.metadata?.source || sourceType,
        duration: result.metadata?.duration || duration,
        format: result.metadata?.format || 'json',
        ingestedAt: new Date().toISOString(),
        configSummary: sanitizeConfigForStorage(sourceType, config),
        recordCount: result.recordCount || result.data.length,
      },
    } as any);

    // Link dataset to project
    await storage.linkProjectToDataset(projectId, dataset.id);

    console.log(`📎 [DataIngestion] Dataset ${dataset.id} linked to project ${projectId}`);

    const detectedPII = (piiAnalysis as any)?.detectedPII || (piiAnalysis as any)?.piiFields || [];

    return res.json({
      success: true,
      datasetId: dataset.id,
      recordCount: result.recordCount || result.data.length,
      schema: result.schema,
      preview: result.data.slice(0, 10),
      piiAnalysis,
      requiresPIIDecision: detectedPII.length > 0,
      sourceType,
      label: displayName,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ [DataIngestion] ${sourceType} error after ${duration}ms:`, error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Data ingestion failed',
      sourceType,
    });
  }
});

export default router;
