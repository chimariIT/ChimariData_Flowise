// server/services/comprehensive-data-ingestion.ts
/**
 * Comprehensive Data Ingestion Service
 * Supports all major data source types and formats
 *
 * Supported Sources:
 * - Files: CSV, Excel, JSON, PDF, Images
 * - Web: Web scraping, API endpoints
 * - Databases: PostgreSQL, MySQL, MongoDB
 * - Cloud Storage: AWS S3, Azure Blob, Google Cloud Storage
 * - Real-time: WebSockets, Streaming APIs
 */

import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { Pool as PgPool } from 'pg';
import { createPool as createMysqlPool, Pool as MysqlPool } from 'mysql2/promise';
import { MongoClient, Db } from 'mongodb';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BlobServiceClient } from '@azure/storage-blob';
import { Storage as GCSStorage } from '@google-cloud/storage';
import { GraphQLClient, gql } from 'graphql-request';
import { createWorker, Worker } from 'tesseract.js';
import sharp from 'sharp';
import { io, Socket } from 'socket.io-client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import * as pdfParse from 'pdf-parse';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface DataSource {
  type: 'file' | 'web' | 'database' | 'cloud' | 'api' | 'streaming';
  config: any;
  metadata?: Record<string, any>;
}

export interface IngestionResult {
  success: boolean;
  data?: any[];
  schema?: Record<string, ColumnSchema>;
  recordCount?: number;
  error?: string;
  metadata: {
    source: string;
    sourceType: string;
    ingestionTime: Date;
    duration: number;
    dataSize: number;
    format?: string;
  };
}

export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'integer' | 'float' | 'binary';
  nullable: boolean;
  unique?: boolean;
  sampleValues?: any[];
}

export interface WebScrapingConfig {
  url: string;
  selector?: string;
  waitFor?: string;
  javascript?: boolean;
  headers?: Record<string, string>;
  cookies?: Array<{ name: string; value: string }>;
  pagination?: {
    enabled: boolean;
    nextSelector?: string;
    maxPages?: number;
  };
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  query: string;
  ssl?: boolean;
}

export interface CloudStorageConfig {
  provider: 'aws' | 'azure' | 'gcp';
  credentials: any;
  bucket?: string;
  container?: string;
  filePath: string;
}

export interface MongoDBConfig {
  connectionString: string;
  database: string;
  collection: string;
  query?: any;
  projection?: any;
  limit?: number;
}

export interface GraphQLConfig {
  endpoint: string;
  query: string;
  variables?: Record<string, any>;
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'api_key';
    token?: string;
    apiKeyHeader?: string;
    apiKeyValue?: string;
  };
}

export interface StreamingConfig {
  type: 'websocket' | 'sse';
  url: string;
  auth?: Record<string, string>;
  reconnect?: boolean;
  maxMessages?: number;
  timeout?: number;
}

export interface OCRConfig {
  language?: string;
  psm?: number; // Page segmentation mode
  oem?: number; // OCR Engine mode
}

// ============================================================================
// Main Comprehensive Data Ingestion Service
// ============================================================================

export class ComprehensiveDataIngestion {
  private s3Client?: S3Client;
  private azureBlobClient?: BlobServiceClient;
  private gcsClient?: GCSStorage;
  private mongoClient?: MongoClient;
  private browserInstance?: puppeteer.Browser;
  private ocrWorker?: Worker;
  private streamingSockets: Map<string, Socket> = new Map();

  // ==========================================================================
  // File-Based Ingestion
  // ==========================================================================

  /**
   * Ingest data from file buffer (CSV, Excel, JSON, PDF, Images)
   */
  async ingestFile(
    buffer: Buffer,
    filename: string,
    mimetype: string
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const ext = path.extname(filename).toLowerCase();

    try {
      let data: any[] = [];
      let schema: Record<string, ColumnSchema> = {};
      let format: string = ext;

      // CSV Files
      if (mimetype === 'text/csv' || ext === '.csv') {
        data = await this.parseCSV(buffer);
        schema = this.detectSchema(data);
        format = 'csv';
      }
      // Excel Files
      else if (
        mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimetype === 'application/vnd.ms-excel' ||
        ext === '.xlsx' ||
        ext === '.xls'
      ) {
        data = this.parseExcel(buffer);
        schema = this.detectSchema(data);
        format = 'excel';
      }
      // JSON Files
      else if (mimetype === 'application/json' || ext === '.json') {
        data = this.parseJSON(buffer);
        schema = this.detectSchema(data);
        format = 'json';
      }
      // PDF Files
      else if (mimetype === 'application/pdf' || ext === '.pdf') {
        const pdfData = await this.parsePDF(buffer);
        data = pdfData.data;
        schema = pdfData.schema;
        format = 'pdf';
      }
      // Image Files
      else if (
        mimetype.startsWith('image/') ||
        ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)
      ) {
        const imageData = await this.parseImage(buffer, filename, mimetype);
        data = imageData.data;
        schema = imageData.schema;
        format = 'image';
      }
      else {
        throw new Error(`Unsupported file type: ${mimetype} (${ext})`);
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        data,
        schema,
        recordCount: data.length,
        metadata: {
          source: filename,
          sourceType: 'file',
          ingestionTime: new Date(),
          duration,
          dataSize: buffer.length,
          format
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: {
          source: filename,
          sourceType: 'file',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: buffer.length
        }
      };
    }
  }

  // ==========================================================================
  // Web Scraping Ingestion
  // ==========================================================================

  /**
   * Scrape data from website using Puppeteer or Cheerio
   */
  async ingestWebScraping(config: WebScrapingConfig): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      let data: any[] = [];

      if (config.javascript) {
        // Use Puppeteer for JavaScript-heavy sites
        data = await this.scrapePuppeteer(config);
      } else {
        // Use Cheerio for static HTML
        data = await this.scrapeCheerio(config);
      }

      const schema = this.detectSchema(data);
      const duration = Date.now() - startTime;

      return {
        success: true,
        data,
        schema,
        recordCount: data.length,
        metadata: {
          source: config.url,
          sourceType: 'web',
          ingestionTime: new Date(),
          duration,
          dataSize: JSON.stringify(data).length,
          format: 'html'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: {
          source: config.url,
          sourceType: 'web',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: 0
        }
      };
    }
  }

  /**
   * Scrape using Cheerio (fast, no JavaScript execution)
   */
  private async scrapeCheerio(config: WebScrapingConfig): Promise<any[]> {
    const response = await axios.get(config.url, {
      headers: config.headers || { 'User-Agent': 'ChimariData/1.0' },
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    const data: any[] = [];

    if (config.selector) {
      $(config.selector).each((index, element) => {
        const $el = $(element);
        data.push({
          text: $el.text().trim(),
          html: $el.html(),
          attributes: $el.attr(),
          index
        });
      });
    } else {
      // Extract all text content
      $('body').find('p, h1, h2, h3, li, td').each((index, element) => {
        const text = $(element).text().trim();
        if (text) {
          data.push({ text, tag: element.tagName, index });
        }
      });
    }

    return data;
  }

  /**
   * Scrape using Puppeteer (supports JavaScript-heavy sites)
   */
  private async scrapePuppeteer(config: WebScrapingConfig): Promise<any[]> {
    if (!this.browserInstance) {
      this.browserInstance = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    const page = await this.browserInstance.newPage();

    // Set headers and cookies
    if (config.headers) {
      await page.setExtraHTTPHeaders(config.headers);
    }
    if (config.cookies) {
      await page.setCookie(...config.cookies);
    }

    await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for specific element if requested
    if (config.waitFor) {
      await page.waitForSelector(config.waitFor, { timeout: 10000 });
    }

    // Extract data
    const data = await page.evaluate((selector) => {
      const elements = selector
        ? document.querySelectorAll(selector)
        : document.querySelectorAll('body *');

      return Array.from(elements).map((el, index) => ({
        text: el.textContent?.trim() || '',
        tag: el.tagName,
        className: el.className,
        id: el.id,
        index
      })).filter(item => item.text.length > 0);
    }, config.selector);

    await page.close();

    return data;
  }

  // ==========================================================================
  // Database Ingestion
  // ==========================================================================

  /**
   * Ingest data from PostgreSQL database
   */
  async ingestPostgreSQL(config: DatabaseConfig): Promise<IngestionResult> {
    const startTime = Date.now();
    const pool = new PgPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      connectionTimeoutMillis: 30000
    });

    try {
      const result = await pool.query(config.query);
      const data = result.rows;
      const schema = this.detectSchemaFromDB(result.fields);
      const duration = Date.now() - startTime;

      await pool.end();

      return {
        success: true,
        data,
        schema,
        recordCount: data.length,
        metadata: {
          source: `${config.host}:${config.port}/${config.database}`,
          sourceType: 'database',
          ingestionTime: new Date(),
          duration,
          dataSize: JSON.stringify(data).length,
          format: 'postgresql'
        }
      };
    } catch (error: any) {
      await pool.end();
      return {
        success: false,
        error: error.message,
        metadata: {
          source: `${config.host}:${config.port}/${config.database}`,
          sourceType: 'database',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: 0
        }
      };
    }
  }

  /**
   * Ingest data from MySQL database
   */
  async ingestMySQL(config: DatabaseConfig): Promise<IngestionResult> {
    const startTime = Date.now();
    const pool = createMysqlPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? {} : undefined,
      connectionLimit: 5,
      connectTimeout: 30000
    });

    try {
      const [rows, fields] = await pool.query(config.query);
      const data = rows as any[];
      const schema = this.detectSchemaFromMySQLFields(fields as any[]);
      const duration = Date.now() - startTime;

      await pool.end();

      return {
        success: true,
        data,
        schema,
        recordCount: data.length,
        metadata: {
          source: `${config.host}:${config.port}/${config.database}`,
          sourceType: 'database',
          ingestionTime: new Date(),
          duration,
          dataSize: JSON.stringify(data).length,
          format: 'mysql'
        }
      };
    } catch (error: any) {
      await pool.end();
      return {
        success: false,
        error: error.message,
        metadata: {
          source: `${config.host}:${config.port}/${config.database}`,
          sourceType: 'database',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: 0
        }
      };
    }
  }

  // ==========================================================================
  // Cloud Storage Ingestion
  // ==========================================================================

  /**
   * Ingest data from AWS S3
   */
  async ingestAWSS3(config: CloudStorageConfig): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      if (!this.s3Client) {
        this.s3Client = new S3Client({
          region: config.credentials.region || 'us-east-1',
          credentials: {
            accessKeyId: config.credentials.accessKeyId,
            secretAccessKey: config.credentials.secretAccessKey
          }
        });
      }

      const command = new GetObjectCommand({
        Bucket: config.bucket!,
        Key: config.filePath
      });

      const response = await this.s3Client.send(command);
      const buffer = await this.streamToBuffer(response.Body as Readable);

      // Determine file type from path
      const ext = path.extname(config.filePath).toLowerCase();
      const filename = path.basename(config.filePath);
      const mimetype = this.getMimetypeFromExtension(ext);

      // Reuse file ingestion logic
      const result = await this.ingestFile(buffer, filename, mimetype);

      result.metadata.source = `s3://${config.bucket}/${config.filePath}`;
      result.metadata.sourceType = 'cloud';
      result.metadata.duration = Date.now() - startTime;

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: {
          source: `s3://${config.bucket}/${config.filePath}`,
          sourceType: 'cloud',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: 0
        }
      };
    }
  }

  /**
   * Ingest data from Azure Blob Storage
   */
  async ingestAzureBlob(config: CloudStorageConfig): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      if (!this.azureBlobClient) {
        this.azureBlobClient = BlobServiceClient.fromConnectionString(
          config.credentials.connectionString
        );
      }

      const containerClient = this.azureBlobClient.getContainerClient(config.container!);
      const blobClient = containerClient.getBlobClient(config.filePath);
      const downloadResponse = await blobClient.download();

      const buffer = await this.streamToBuffer(downloadResponse.readableStreamBody as Readable);

      // Determine file type from path
      const ext = path.extname(config.filePath).toLowerCase();
      const filename = path.basename(config.filePath);
      const mimetype = this.getMimetypeFromExtension(ext);

      // Reuse file ingestion logic
      const result = await this.ingestFile(buffer, filename, mimetype);

      result.metadata.source = `azure://${config.container}/${config.filePath}`;
      result.metadata.sourceType = 'cloud';
      result.metadata.duration = Date.now() - startTime;

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: {
          source: `azure://${config.container}/${config.filePath}`,
          sourceType: 'cloud',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: 0
        }
      };
    }
  }

  // ==========================================================================
  // API Ingestion
  // ==========================================================================

  /**
   * Ingest data from REST API endpoint
   */
  async ingestAPI(
    url: string,
    options?: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: any;
      auth?: { type: 'bearer' | 'basic'; token?: string; username?: string; password?: string };
    }
  ): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      const headers = options?.headers || {};

      // Add authentication
      if (options?.auth) {
        if (options.auth.type === 'bearer' && options.auth.token) {
          headers['Authorization'] = `Bearer ${options.auth.token}`;
        } else if (options.auth.type === 'basic' && options.auth.username && options.auth.password) {
          const credentials = Buffer.from(
            `${options.auth.username}:${options.auth.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
      }

      const response = await axios({
        url,
        method: options?.method || 'GET',
        headers,
        data: options?.body,
        timeout: 30000
      });

      let data = response.data;

      // Ensure data is an array
      if (!Array.isArray(data)) {
        if (typeof data === 'object' && data !== null) {
          // Check for common array wrappers
          if (data.data && Array.isArray(data.data)) {
            data = data.data;
          } else if (data.results && Array.isArray(data.results)) {
            data = data.results;
          } else if (data.items && Array.isArray(data.items)) {
            data = data.items;
          } else {
            data = [data];
          }
        } else {
          data = [{ value: data }];
        }
      }

      const schema = this.detectSchema(data);
      const duration = Date.now() - startTime;

      return {
        success: true,
        data,
        schema,
        recordCount: data.length,
        metadata: {
          source: url,
          sourceType: 'api',
          ingestionTime: new Date(),
          duration,
          dataSize: JSON.stringify(data).length,
          format: 'json'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: {
          source: url,
          sourceType: 'api',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: 0
        }
      };
    }
  }

  // ==========================================================================
  // File Parsing Helpers
  // ==========================================================================

  private async parseCSV(buffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const csvString = buffer.toString('utf8');
      Papa.parse(csvString, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (error) => reject(error)
      });
    });
  }

  private parseExcel(buffer: Buffer): any[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(firstSheet);
  }

  private parseJSON(buffer: Buffer): any[] {
    const jsonString = buffer.toString('utf8');
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  /**
   * Parse PDF files (extract text and tables)
   * Uses pdf-parse for full text extraction
   */
  private async parsePDF(buffer: Buffer): Promise<{ data: any[]; schema: Record<string, ColumnSchema> }> {
    try {
      const pdfData = await pdfParse(buffer);

      // Extract text by pages (if available)
      const pages = pdfData.text.split('\f'); // Form feed character separates pages
      const data = pages.map((pageText, index) => ({
        page: index + 1,
        content: pageText.trim(),
        extractionMethod: 'pdf-parse',
        metadata: {
          totalPages: pdfData.numpages,
          info: pdfData.info,
          version: pdfData.version
        }
      })).filter(page => page.content.length > 0);

      const schema: Record<string, ColumnSchema> = {
        page: { name: 'page', type: 'integer', nullable: false },
        content: { name: 'content', type: 'string', nullable: false },
        extractionMethod: { name: 'extractionMethod', type: 'string', nullable: false },
        metadata: { name: 'metadata', type: 'string', nullable: true }
      };

      return { data, schema };
    } catch (error: any) {
      console.error('PDF parsing error:', error);
      // Fallback to basic structure
      return {
        data: [{ page: 1, content: `PDF parsing error: ${error.message}`, extractionMethod: 'error' }],
        schema: {
          page: { name: 'page', type: 'integer', nullable: false },
          content: { name: 'content', type: 'string', nullable: false },
          extractionMethod: { name: 'extractionMethod', type: 'string', nullable: false }
        }
      };
    }
  }

  /**
   * Parse image files (extract metadata and optionally OCR)
   * Uses Sharp for metadata and Tesseract.js for OCR
   */
  private async parseImage(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    enableOCR: boolean = false
  ): Promise<{ data: any[]; schema: Record<string, ColumnSchema> }> {
    try {
      // Extract metadata using Sharp
      const metadata = await sharp(buffer).metadata();

      const data: any[] = [
        {
          filename,
          mimetype,
          size: buffer.length,
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          colorSpace: metadata.space,
          channels: metadata.channels,
          hasAlpha: metadata.hasAlpha,
          extractionMethod: 'sharp-metadata'
        }
      ];

      // Perform OCR if requested
      if (enableOCR) {
        const ocrText = await this.performOCR(buffer);
        data[0].ocrText = ocrText;
        data[0].extractionMethod = 'sharp-metadata+ocr';
      }

      const schema: Record<string, ColumnSchema> = {
        filename: { name: 'filename', type: 'string', nullable: false },
        mimetype: { name: 'mimetype', type: 'string', nullable: false },
        size: { name: 'size', type: 'integer', nullable: false },
        width: { name: 'width', type: 'integer', nullable: true },
        height: { name: 'height', type: 'integer', nullable: true },
        format: { name: 'format', type: 'string', nullable: false },
        colorSpace: { name: 'colorSpace', type: 'string', nullable: true },
        channels: { name: 'channels', type: 'integer', nullable: true },
        hasAlpha: { name: 'hasAlpha', type: 'boolean', nullable: true },
        ocrText: { name: 'ocrText', type: 'string', nullable: true },
        extractionMethod: { name: 'extractionMethod', type: 'string', nullable: false }
      };

      return { data, schema };
    } catch (error: any) {
      console.error('Image parsing error:', error);
      return {
        data: [{
          filename,
          mimetype,
          size: buffer.length,
          error: error.message,
          extractionMethod: 'error'
        }],
        schema: {
          filename: { name: 'filename', type: 'string', nullable: false },
          mimetype: { name: 'mimetype', type: 'string', nullable: false },
          size: { name: 'size', type: 'integer', nullable: false },
          error: { name: 'error', type: 'string', nullable: true },
          extractionMethod: { name: 'extractionMethod', type: 'string', nullable: false }
        }
      };
    }
  }

  /**
   * Perform OCR on image buffer using Tesseract.js
   */
  private async performOCR(buffer: Buffer, config?: OCRConfig): Promise<string> {
    try {
      if (!this.ocrWorker) {
        this.ocrWorker = await createWorker('eng');
      }

      const { data } = await this.ocrWorker.recognize(buffer);
      return data.text;
    } catch (error: any) {
      console.error('OCR error:', error);
      return `OCR failed: ${error.message}`;
    }
  }

  // ==========================================================================
  // Schema Detection
  // ==========================================================================

  private detectSchema(data: any[]): Record<string, ColumnSchema> {
    if (data.length === 0) return {};

    const schema: Record<string, ColumnSchema> = {};
    const firstRow = data[0];

    for (const key of Object.keys(firstRow)) {
      const values = data.map(row => row[key]);
      const nonNullValues = values.filter(v => v !== null && v !== undefined);

      schema[key] = {
        name: key,
        type: this.inferType(nonNullValues),
        nullable: nonNullValues.length < data.length,
        unique: new Set(values).size === data.length,
        sampleValues: nonNullValues.slice(0, 5)
      };
    }

    return schema;
  }

  private detectSchemaFromDB(fields: any[]): Record<string, ColumnSchema> {
    const schema: Record<string, ColumnSchema> = {};

    for (const field of fields) {
      schema[field.name] = {
        name: field.name,
        type: this.mapDBTypeToGeneric(field.dataTypeID),
        nullable: true
      };
    }

    return schema;
  }

  private detectSchemaFromMySQLFields(fields: any[]): Record<string, ColumnSchema> {
    const schema: Record<string, ColumnSchema> = {};

    for (const field of fields) {
      schema[field.name] = {
        name: field.name,
        type: this.mapMySQLTypeToGeneric(field.type),
        nullable: (field.flags & 1) === 0 // NOT_NULL flag
      };
    }

    return schema;
  }

  private inferType(values: any[]): ColumnSchema['type'] {
    if (values.length === 0) return 'string';

    const sample = values[0];

    if (typeof sample === 'boolean') return 'boolean';
    if (typeof sample === 'number') {
      return Number.isInteger(sample) ? 'integer' : 'float';
    }
    if (sample instanceof Date) return 'date';
    if (typeof sample === 'string') {
      if (!isNaN(Date.parse(sample))) return 'date';
      if (!isNaN(Number(sample))) {
        return Number.isInteger(Number(sample)) ? 'integer' : 'float';
      }
    }

    return 'string';
  }

  private mapDBTypeToGeneric(dataTypeID: number): ColumnSchema['type'] {
    // PostgreSQL type mapping
    const typeMap: Record<number, ColumnSchema['type']> = {
      20: 'integer', // int8
      21: 'integer', // int2
      23: 'integer', // int4
      700: 'float', // float4
      701: 'float', // float8
      1082: 'date', // date
      1114: 'date', // timestamp
      16: 'boolean', // bool
    };
    return typeMap[dataTypeID] || 'string';
  }

  private mapMySQLTypeToGeneric(type: number): ColumnSchema['type'] {
    // MySQL type constants
    const INT_TYPES = [1, 2, 3, 8, 9];
    const FLOAT_TYPES = [4, 5];
    const DATE_TYPES = [7, 10, 11, 12, 13, 14];

    if (INT_TYPES.includes(type)) return 'integer';
    if (FLOAT_TYPES.includes(type)) return 'float';
    if (DATE_TYPES.includes(type)) return 'date';

    return 'string';
  }

  // ==========================================================================
  // Helper Utilities
  // ==========================================================================

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private getMimetypeFromExtension(ext: string): string {
    const mimetypes: Record<string, string> = {
      '.csv': 'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp'
    };
    return mimetypes[ext] || 'application/octet-stream';
  }

  // ==========================================================================
  // MongoDB Ingestion
  // ==========================================================================

  /**
   * Ingest data from MongoDB database
   */
  async ingestMongoDB(config: MongoDBConfig): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      if (!this.mongoClient) {
        this.mongoClient = new MongoClient(config.connectionString);
        await this.mongoClient.connect();
      }

      const db = this.mongoClient.db(config.database);
      const collection = db.collection(config.collection);

      // Execute query with optional projection and limit
      const query = config.query || {};
      const projection = config.projection || {};
      const limit = config.limit || 1000;

      const cursor = collection.find(query, { projection }).limit(limit);
      const data = await cursor.toArray();

      // Convert MongoDB _id to string for easier handling
      const cleanedData = data.map(doc => ({
        ...doc,
        _id: doc._id?.toString()
      }));

      const schema = this.detectSchema(cleanedData);
      const duration = Date.now() - startTime;

      return {
        success: true,
        data: cleanedData,
        schema,
        recordCount: cleanedData.length,
        metadata: {
          source: `${config.connectionString}/${config.database}/${config.collection}`,
          sourceType: 'database',
          ingestionTime: new Date(),
          duration,
          dataSize: JSON.stringify(cleanedData).length,
          format: 'mongodb'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: {
          source: `${config.database}/${config.collection}`,
          sourceType: 'database',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: 0
        }
      };
    }
  }

  // ==========================================================================
  // Google Cloud Storage Ingestion
  // ==========================================================================

  /**
   * Ingest data from Google Cloud Storage
   */
  async ingestGoogleCloudStorage(config: CloudStorageConfig): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      if (!this.gcsClient) {
        this.gcsClient = new GCSStorage({
          projectId: config.credentials.projectId,
          credentials: config.credentials
        });
      }

      const bucket = this.gcsClient.bucket(config.bucket!);
      const file = bucket.file(config.filePath);

      // Download file
      const [buffer] = await file.download();

      // Determine file type from path
      const ext = path.extname(config.filePath).toLowerCase();
      const filename = path.basename(config.filePath);
      const mimetype = this.getMimetypeFromExtension(ext);

      // Reuse file ingestion logic
      const result = await this.ingestFile(buffer, filename, mimetype);

      result.metadata.source = `gs://${config.bucket}/${config.filePath}`;
      result.metadata.sourceType = 'cloud';
      result.metadata.duration = Date.now() - startTime;

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: {
          source: `gs://${config.bucket}/${config.filePath}`,
          sourceType: 'cloud',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: 0
        }
      };
    }
  }

  // ==========================================================================
  // GraphQL API Ingestion
  // ==========================================================================

  /**
   * Ingest data from GraphQL API
   */
  async ingestGraphQL(config: GraphQLConfig): Promise<IngestionResult> {
    const startTime = Date.now();

    try {
      const headers = config.headers || {};

      // Add authentication
      if (config.auth) {
        if (config.auth.type === 'bearer' && config.auth.token) {
          headers['Authorization'] = `Bearer ${config.auth.token}`;
        } else if (config.auth.type === 'api_key' && config.auth.apiKeyHeader && config.auth.apiKeyValue) {
          headers[config.auth.apiKeyHeader] = config.auth.apiKeyValue;
        }
      }

      const client = new GraphQLClient(config.endpoint, { headers });

      // Execute GraphQL query
      const response = await client.request(config.query, config.variables);

      // Extract data from response (try common patterns)
      let data: any[] = [];
      if (Array.isArray(response)) {
        data = response;
      } else if (typeof response === 'object') {
        // Try to find the array in the response
        const firstKey = Object.keys(response)[0];
        if (firstKey && Array.isArray(response[firstKey])) {
          data = response[firstKey];
        } else {
          data = [response];
        }
      }

      const schema = this.detectSchema(data);
      const duration = Date.now() - startTime;

      return {
        success: true,
        data,
        schema,
        recordCount: data.length,
        metadata: {
          source: config.endpoint,
          sourceType: 'api',
          ingestionTime: new Date(),
          duration,
          dataSize: JSON.stringify(data).length,
          format: 'graphql'
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metadata: {
          source: config.endpoint,
          sourceType: 'api',
          ingestionTime: new Date(),
          duration: Date.now() - startTime,
          dataSize: 0
        }
      };
    }
  }

  // ==========================================================================
  // Real-time Streaming Ingestion
  // ==========================================================================

  /**
   * Ingest real-time streaming data from WebSocket or SSE
   */
  async ingestStreaming(config: StreamingConfig): Promise<IngestionResult> {
    const startTime = Date.now();
    const data: any[] = [];
    const maxMessages = config.maxMessages || 100;
    const timeout = config.timeout || 30000;

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(createResult());
      }, timeout);

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (socket) {
          socket.disconnect();
          this.streamingSockets.delete(config.url);
        }
      };

      const createResult = (): IngestionResult => {
        const schema = data.length > 0 ? this.detectSchema(data) : {};
        const duration = Date.now() - startTime;

        return {
          success: data.length > 0,
          data,
          schema,
          recordCount: data.length,
          metadata: {
            source: config.url,
            sourceType: 'streaming',
            ingestionTime: new Date(),
            duration,
            dataSize: JSON.stringify(data).length,
            format: config.type
          }
        };
      };

      if (config.type === 'websocket') {
        const socket = io(config.url, {
          auth: config.auth,
          reconnection: config.reconnect !== false
        });

        this.streamingSockets.set(config.url, socket);

        socket.on('connect', () => {
          console.log('WebSocket connected:', config.url);
        });

        socket.on('message', (message: any) => {
          data.push(message);
          if (data.length >= maxMessages) {
            cleanup();
            resolve(createResult());
          }
        });

        socket.on('data', (message: any) => {
          data.push(message);
          if (data.length >= maxMessages) {
            cleanup();
            resolve(createResult());
          }
        });

        socket.on('error', (error: any) => {
          console.error('WebSocket error:', error);
          cleanup();
          resolve({
            success: false,
            error: error.message,
            metadata: {
              source: config.url,
              sourceType: 'streaming',
              ingestionTime: new Date(),
              duration: Date.now() - startTime,
              dataSize: 0
            }
          });
        });

        socket.on('disconnect', () => {
          cleanup();
          resolve(createResult());
        });
      } else {
        // SSE (Server-Sent Events) support would go here
        resolve({
          success: false,
          error: 'SSE not yet implemented',
          metadata: {
            source: config.url,
            sourceType: 'streaming',
            ingestionTime: new Date(),
            duration: Date.now() - startTime,
            dataSize: 0
          }
        });
      }
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Close browser
    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = undefined;
    }

    // Terminate OCR worker
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = undefined;
    }

    // Close MongoDB connection
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = undefined;
    }

    // Disconnect all streaming sockets
    for (const [url, socket] of this.streamingSockets.entries()) {
      socket.disconnect();
    }
    this.streamingSockets.clear();
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const dataIngestion = new ComprehensiveDataIngestion();

// Cleanup on process exit
process.on('beforeExit', async () => {
  await dataIngestion.cleanup();
});
