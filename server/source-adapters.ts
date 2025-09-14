import * as XLSX from 'xlsx';
import { Dataset, InsertDataset, InsertStreamChunk, InsertStreamCheckpoint } from '@shared/schema';
import { nanoid } from 'nanoid';

// Dynamic imports for optional dependencies to prevent app crashes
let WebSocketClass: any = null;
let fetchImpl: any = null;

async function getWebSocket() {
  if (!WebSocketClass) {
    try {
      const ws = await import('ws');
      WebSocketClass = ws.default;
    } catch (error) {
      throw new Error('WebSocket streaming requires "ws" package to be installed: npm install ws');
    }
  }
  return WebSocketClass;
}

async function getFetch() {
  if (!fetchImpl) {
    try {
      // Try native fetch first (Node 18+), then fallback to node-fetch
      if (typeof fetch !== 'undefined') {
        fetchImpl = fetch;
      } else {
        const nodeFetch = await import('node-fetch');
        fetchImpl = nodeFetch.default;
      }
    } catch (error) {
      throw new Error('HTTP requests require native fetch (Node 18+) or "node-fetch" package: npm install node-fetch');
    }
  }
  return fetchImpl;
}

// Base interface for all source adapters
export interface SourceAdapter {
  sourceType: string;
  supportedMimeTypes: string[];
  supportedExtensions: string[];
  
  /**
   * Check if this adapter can handle the given file/source
   */
  canHandle(mimeType: string, fileName: string): boolean;
  
  /**
   * Process the source and return normalized dataset information
   */
  process(input: SourceInput): Promise<SourceResult>;
}

export interface SourceInput {
  // For file uploads
  buffer?: Buffer;
  fileName?: string;
  mimeType?: string;
  
  // For web/API sources
  url?: string;
  
  // For cloud storage
  cloudPath?: string;
  cloudProvider?: 'aws' | 'azure' | 'gcp';
  
  // Processing options
  options?: {
    selectedSheet?: string;
    headerRow?: number;
    encoding?: string;
    extractText?: boolean; // For PDFs
    tableDetection?: boolean; // For PDFs
  };
}

export interface SourceResult {
  // Normalized data
  data: any[];
  schema: Record<string, {
    type: string;
    nullable: boolean;
    sampleValues: string[];
    description?: string;
  }>;
  recordCount: number;
  preview: any[];
  
  // Source metadata for storage
  sourceMetadata: {
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    extractionMethod?: string;
    processingOptions?: any;
    rawDataPreserved?: boolean;
    sourceType: string;
  };
  
  // For dataset creation
  storageUri: string; // Where the raw data is stored
  checksum?: string;
}

/**
 * CSV Source Adapter - handles CSV files with smart header detection
 */
export class CsvAdapter implements SourceAdapter {
  sourceType = 'upload';
  supportedMimeTypes = ['text/csv', 'application/csv'];
  supportedExtensions = ['.csv'];

  canHandle(mimeType: string, fileName: string): boolean {
    return this.supportedMimeTypes.includes(mimeType) || 
           this.supportedExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  async process(input: SourceInput): Promise<SourceResult> {
    if (!input.buffer || !input.fileName) {
      throw new Error('CSV adapter requires buffer and fileName');
    }

    const text = input.buffer.toString('utf-8');
    const data = this.parseCSV(text);
    const schema = this.generateSchema(data);
    const preview = data.slice(0, 100);
    
    // Generate storage URI and checksum
    const storageUri = `datasets/${nanoid()}-${input.fileName}`;
    const checksum = this.generateChecksum(input.buffer);

    return {
      data,
      schema,
      recordCount: data.length,
      preview,
      sourceMetadata: {
        originalFileName: input.fileName,
        mimeType: input.mimeType || 'text/csv',
        fileSize: input.buffer.length,
        extractionMethod: 'csv_smart_header',
        processingOptions: input.options,
        rawDataPreserved: true,
        sourceType: this.sourceType
      },
      storageUri,
      checksum
    };
  }

  private parseCSV(text: string): any[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    
    // Smart header detection
    const headerRowIndex = this.detectHeaderRow(lines);
    const headers = lines[headerRowIndex].split(',').map(h => h.trim().replace(/"/g, ''));
    const data: any[] = [];
    
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      
      headers.forEach((header, index) => {
        const value = values[index] || '';
        const numValue = parseFloat(value);
        row[header] = !isNaN(numValue) && value !== '' ? numValue : value;
      });
      
      data.push(row);
    }
    
    return data;
  }

  private detectHeaderRow(lines: string[]): number {
    for (let i = 0; i < Math.min(5, lines.length - 1); i++) {
      const currentRow = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const nextRow = lines[i + 1].split(',').map(v => v.trim().replace(/"/g, ''));
      
      const currentHasNumbers = currentRow.some(val => !isNaN(parseFloat(val)) && val !== '');
      const nextHasNumbers = nextRow.some(val => !isNaN(parseFloat(val)) && val !== '');
      
      if (!currentHasNumbers && nextHasNumbers) return i;
      
      const currentHasDescriptiveNames = currentRow.some(val => 
        val.length > 3 && /^[a-zA-Z_][a-zA-Z0-9_\s]*$/.test(val)
      );
      
      if (currentHasDescriptiveNames && nextHasNumbers) return i;
    }
    
    return 0;
  }

  private generateSchema(data: any[]): Record<string, any> {
    if (data.length === 0) return {};

    const schema: Record<string, any> = {};
    const sampleSize = Math.min(data.length, 100);
    const sampleData = data.slice(0, sampleSize);

    const allKeys = new Set<string>();
    sampleData.forEach(row => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(key => allKeys.add(key));
      }
    });

    allKeys.forEach(key => {
      const values = sampleData
        .map(row => row[key])
        .filter(val => val !== null && val !== undefined && val !== '');
      
      const nullCount = sampleData.length - values.length;
      const nullable = nullCount > 0;
      
      let type = 'text';
      if (values.length > 0) {
        const firstValue = values[0];
        if (typeof firstValue === 'number') {
          type = 'number';
        } else if (typeof firstValue === 'boolean') {
          type = 'boolean';
        } else if (this.isDate(firstValue)) {
          type = 'date';
        } else if (this.isEmail(firstValue)) {
          type = 'email';
        } else if (this.isUrl(firstValue)) {
          type = 'url';
        }
      }

      const uniqueValues = Array.from(new Set(values.map(v => String(v))));
      const sampleValues = uniqueValues.slice(0, 5);

      schema[key] = {
        type,
        nullable,
        sampleValues
      };
    });

    return schema;
  }

  private isDate(value: any): boolean {
    if (typeof value === 'string') {
      const date = new Date(value);
      return !isNaN(date.getTime()) && value.length > 8;
    }
    return false;
  }

  private isEmail(value: any): boolean {
    if (typeof value === 'string') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    return false;
  }

  private isUrl(value: any): boolean {
    if (typeof value === 'string') {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private generateChecksum(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

/**
 * JSON Source Adapter - handles JSON files and API responses
 */
export class JsonAdapter implements SourceAdapter {
  sourceType = 'upload';
  supportedMimeTypes = ['application/json'];
  supportedExtensions = ['.json'];

  canHandle(mimeType: string, fileName: string): boolean {
    return this.supportedMimeTypes.includes(mimeType) || 
           this.supportedExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  async process(input: SourceInput): Promise<SourceResult> {
    if (!input.buffer || !input.fileName) {
      throw new Error('JSON adapter requires buffer and fileName');
    }

    const text = input.buffer.toString('utf-8');
    const parsed = JSON.parse(text);
    
    let data: any[];
    if (Array.isArray(parsed)) {
      data = parsed;
    } else if (typeof parsed === 'object') {
      data = [parsed];
    } else {
      throw new Error('JSON file must contain an array or object');
    }

    const schema = this.generateSchema(data);
    const preview = data.slice(0, 100);
    
    const storageUri = `datasets/${nanoid()}-${input.fileName}`;
    const checksum = this.generateChecksum(input.buffer);

    return {
      data,
      schema,
      recordCount: data.length,
      preview,
      sourceMetadata: {
        originalFileName: input.fileName,
        mimeType: input.mimeType || 'application/json',
        fileSize: input.buffer.length,
        extractionMethod: 'json_parse',
        processingOptions: input.options,
        rawDataPreserved: true,
        sourceType: this.sourceType
      },
      storageUri,
      checksum
    };
  }

  private generateSchema(data: any[]): Record<string, any> {
    // Reuse the same schema generation logic as CSV adapter
    const csvAdapter = new CsvAdapter();
    return (csvAdapter as any).generateSchema(data);
  }

  private generateChecksum(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

/**
 * Excel Source Adapter - handles XLSX and XLS files
 */
export class ExcelAdapter implements SourceAdapter {
  sourceType = 'upload';
  supportedMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  supportedExtensions = ['.xlsx', '.xls'];

  canHandle(mimeType: string, fileName: string): boolean {
    return this.supportedMimeTypes.includes(mimeType) || 
           this.supportedExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  async process(input: SourceInput): Promise<SourceResult> {
    if (!input.buffer || !input.fileName) {
      throw new Error('Excel adapter requires buffer and fileName');
    }

    const workbook = XLSX.read(input.buffer, { type: 'buffer' });
    const sheetName = input.options?.selectedSheet || workbook.SheetNames[0];
    
    if (!sheetName) {
      throw new Error('No sheets found in Excel file');
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: null 
    });

    if (rawData.length < 2) {
      throw new Error('Excel file must have at least a header row and one data row');
    }

    // Smart header detection
    const headerRowIndex = this.detectExcelHeaderRow(rawData as any[][]);
    const headers = rawData[headerRowIndex] as string[];
    const rows = rawData.slice(headerRowIndex + 1) as any[][];

    const data = rows.map(row => {
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] !== undefined ? row[index] : null;
      });
      return obj;
    });

    const schema = this.generateSchema(data);
    const preview = data.slice(0, 100);
    
    const storageUri = `datasets/${nanoid()}-${input.fileName}`;
    const checksum = this.generateChecksum(input.buffer);

    return {
      data,
      schema,
      recordCount: data.length,
      preview,
      sourceMetadata: {
        originalFileName: input.fileName,
        mimeType: input.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: input.buffer.length,
        extractionMethod: 'excel_sheet_parse',
        processingOptions: { 
          ...input.options, 
          selectedSheet: sheetName,
          availableSheets: workbook.SheetNames 
        },
        rawDataPreserved: true,
        sourceType: this.sourceType
      },
      storageUri,
      checksum
    };
  }

  private detectExcelHeaderRow(data: any[][]): number {
    for (let i = 0; i < Math.min(5, data.length - 1); i++) {
      const currentRow = data[i] || [];
      const nextRow = data[i + 1] || [];
      
      const currentHasNumbers = currentRow.some(val => typeof val === 'number');
      const nextHasNumbers = nextRow.some(val => typeof val === 'number');
      
      if (!currentHasNumbers && nextHasNumbers) return i;
      
      const currentHasDescriptiveNames = currentRow.some(val => 
        typeof val === 'string' && val.length > 3 && /^[a-zA-Z_][a-zA-Z0-9_\s]*$/.test(val)
      );
      
      if (currentHasDescriptiveNames && nextHasNumbers) return i;
    }
    
    return 0;
  }

  private generateSchema(data: any[]): Record<string, any> {
    const csvAdapter = new CsvAdapter();
    return (csvAdapter as any).generateSchema(data);
  }

  private generateChecksum(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

/**
 * PDF Source Adapter - handles PDF files with text and table extraction
 */
export class PdfAdapter implements SourceAdapter {
  sourceType = 'upload';
  supportedMimeTypes = ['application/pdf'];
  supportedExtensions = ['.pdf'];

  canHandle(mimeType: string, fileName: string): boolean {
    return this.supportedMimeTypes.includes(mimeType) || 
           this.supportedExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  }

  async process(input: SourceInput): Promise<SourceResult> {
    if (!input.buffer || !input.fileName) {
      throw new Error('PDF adapter requires buffer and fileName');
    }

    // For now, implement basic text extraction
    // TODO: Add proper PDF parsing with libraries like pdf-parse or pdf2pic
    const extractedText = await this.extractTextFromPDF(input.buffer);
    
    let data: any[];
    if (input.options?.tableDetection) {
      data = this.extractTablesFromText(extractedText);
    } else {
      data = this.extractTextRecords(extractedText);
    }

    const schema = this.generateSchema(data);
    const preview = data.slice(0, 100);
    
    const storageUri = `datasets/${nanoid()}-${input.fileName}`;
    const checksum = this.generateChecksum(input.buffer);

    return {
      data,
      schema,
      recordCount: data.length,
      preview,
      sourceMetadata: {
        originalFileName: input.fileName,
        mimeType: input.mimeType || 'application/pdf',
        fileSize: input.buffer.length,
        extractionMethod: input.options?.tableDetection ? 'pdf_table_extraction' : 'pdf_text_extraction',
        processingOptions: input.options,
        rawDataPreserved: true,
        sourceType: this.sourceType
      },
      storageUri,
      checksum
    };
  }

  private async extractTextFromPDF(buffer: Buffer): Promise<string> {
    // Placeholder implementation - in production, use pdf-parse or similar
    try {
      // For now, return a simple message indicating PDF processing is needed
      return "PDF text extraction requires additional setup. Raw PDF data preserved for future processing.";
    } catch (error: any) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  private extractTablesFromText(text: string): any[] {
    // Simple table detection from text
    const lines = text.split('\n').filter(line => line.trim());
    
    // Look for lines that might be table rows (contain multiple words/numbers separated by spaces or tabs)
    const tableLines = lines.filter(line => {
      const parts = line.split(/\s{2,}|\t/);
      return parts.length > 2; // At least 3 columns
    });

    if (tableLines.length < 2) {
      // No table detected, return text records
      return this.extractTextRecords(text);
    }

    // Assume first line is headers
    const headers = tableLines[0].split(/\s{2,}|\t/).map(h => h.trim());
    const data = tableLines.slice(1).map((line, index) => {
      const values = line.split(/\s{2,}|\t/).map(v => v.trim());
      const row: any = { row_number: index + 1 };
      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });
      return row;
    });

    return data;
  }

  private extractTextRecords(text: string): any[] {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map((line, index) => ({
      line_number: index + 1,
      content: line.trim(),
      source: 'pdf_text_extraction'
    }));
  }

  private generateSchema(data: any[]): Record<string, any> {
    const csvAdapter = new CsvAdapter();
    return (csvAdapter as any).generateSchema(data);
  }

  private generateChecksum(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

/**
 * Security configuration for WebAdapter SSRF protection
 */
interface WebAdapterSecurityConfig {
  allowedDomains: string[];
  allowPrivateNetworks: boolean;
  maxResponseSize: number;
  requestTimeout: number;
  maxRedirects: number;
  allowedContentTypes: string[];
  allowedProtocols: string[];
}

/**
 * Web Source Adapter - handles web URLs and API endpoints with SSRF protection
 */
export class WebAdapter implements SourceAdapter {
  sourceType = 'web';
  supportedMimeTypes = ['application/json', 'text/csv', 'application/csv'];
  supportedExtensions = [];

  private securityConfig: WebAdapterSecurityConfig = {
    // Trusted domains for data sources - expand as needed
    allowedDomains: [
      'api.github.com',
      'raw.githubusercontent.com',
      'data.gov',
      'api.data.gov',
      'opendata.gov',
      'kaggle.com',
      'data.world',
      'api.census.gov'
    ],
    allowPrivateNetworks: false,
    maxResponseSize: 100 * 1024 * 1024, // 100MB
    requestTimeout: 30000, // 30 seconds
    maxRedirects: 3,
    allowedContentTypes: [
      'application/json',
      'text/csv',
      'application/csv',
      'text/plain'
    ],
    allowedProtocols: ['http:', 'https:']
  };

  canHandle(mimeType: string, fileName: string): boolean {
    // Web adapter is identified by having a URL input
    return true; // Will be checked by presence of url in input
  }

  async process(input: SourceInput): Promise<SourceResult> {
    if (!input.url) {
      throw new Error('Web adapter requires URL');
    }

    // Comprehensive security validation
    await this.validateUrl(input.url);

    try {
      const fetchFn = await getFetch();
      const response = await this.secureHttpRequest(input.url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type
      const contentType = response.headers.get('content-type') || '';
      this.validateContentType(contentType);

      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Validate response size
      if (buffer.length > this.securityConfig.maxResponseSize) {
        throw new Error(`Response too large: ${buffer.length} bytes exceeds ${this.securityConfig.maxResponseSize} bytes`);
      }

      const fileName = this.extractFileNameFromUrl(input.url);

      // Determine how to process based on content type
      let adapter: SourceAdapter;
      if (contentType.includes('application/json')) {
        adapter = new JsonAdapter();
      } else if (contentType.includes('text/csv') || contentType.includes('application/csv')) {
        adapter = new CsvAdapter();
      } else {
        // Default to JSON for APIs, CSV for data files
        adapter = input.url.includes('api') ? new JsonAdapter() : new CsvAdapter();
      }

      const result = await adapter.process({
        buffer,
        fileName,
        mimeType: contentType,
        options: input.options
      });

      // Update metadata to reflect web source
      result.sourceMetadata = {
        ...result.sourceMetadata,
        sourceType: 'web',
        extractionMethod: `web_${result.sourceMetadata.extractionMethod}`,
        processingOptions: {
          ...result.sourceMetadata.processingOptions,
          sourceUrl: input.url,
          fetchedAt: new Date().toISOString(),
          securityValidated: true
        }
      };

      return result;
    } catch (error: any) {
      throw new Error(`Web data fetch failed: ${error.message}`);
    }
  }

  /**
   * Comprehensive URL security validation to prevent SSRF attacks
   */
  private async validateUrl(url: string): Promise<void> {
    let urlObj: URL;
    
    try {
      urlObj = new URL(url);
    } catch (error) {
      throw new Error('Invalid URL format');
    }

    // 1. Protocol validation - only allow HTTP/HTTPS
    if (!this.securityConfig.allowedProtocols.includes(urlObj.protocol)) {
      throw new Error(`Protocol ${urlObj.protocol} is not allowed. Only ${this.securityConfig.allowedProtocols.join(', ')} are permitted`);
    }

    // 2. Domain allowlist validation
    if (!this.isDomainAllowed(urlObj.hostname)) {
      throw new Error(`Domain ${urlObj.hostname} is not in the allowed domains list. Contact administrator to add trusted domains.`);
    }

    // 3. IP address validation to prevent access to private networks
    await this.validateIpAddress(urlObj.hostname);

    // 4. Port validation - only allow standard HTTP/HTTPS ports
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    if (!['80', '443', '8080', '8443'].includes(port)) {
      throw new Error(`Port ${port} is not allowed. Only standard HTTP/HTTPS ports are permitted`);
    }

    // 5. Path validation - prevent access to sensitive paths
    const path = urlObj.pathname.toLowerCase();
    const suspiciousPaths = ['/admin', '/internal', '/private', '/management', '/actuator', '/health'];
    if (suspiciousPaths.some(suspPath => path.includes(suspPath))) {
      throw new Error(`Access to path ${urlObj.pathname} is not allowed`);
    }
  }

  /**
   * Check if domain is in the allowlist
   */
  private isDomainAllowed(hostname: string): boolean {
    const cleanHostname = hostname.toLowerCase();
    
    return this.securityConfig.allowedDomains.some(allowedDomain => {
      const cleanAllowed = allowedDomain.toLowerCase();
      // Exact match or subdomain match
      return cleanHostname === cleanAllowed || cleanHostname.endsWith('.' + cleanAllowed);
    });
  }

  /**
   * Validate IP address to prevent access to private networks and localhost
   */
  private async validateIpAddress(hostname: string): Promise<void> {
    const dns = require('dns');
    const { promisify } = require('util');
    const lookup = promisify(dns.lookup);

    // Block private networks if not explicitly allowed
    if (!this.securityConfig.allowPrivateNetworks) {
      // Check if hostname is already an IP address
      if (this.isPrivateIpAddress(hostname)) {
        throw new Error(`Access to private IP address ${hostname} is not allowed`);
      }

      // Resolve hostname to IP and check if it's private
      try {
        const result = await lookup(hostname);
        const ipAddress = result.address;
        
        if (this.isPrivateIpAddress(ipAddress)) {
          throw new Error(`Hostname ${hostname} resolves to private IP address ${ipAddress} which is not allowed`);
        }
      } catch (dnsError: any) {
        throw new Error(`DNS resolution failed for ${hostname}: ${dnsError.message}`);
      }
    }
  }

  /**
   * Check if an IP address is in private/internal ranges
   */
  private isPrivateIpAddress(ip: string): boolean {
    // IPv4 private ranges
    const privateRanges = [
      /^127\./, // Loopback (127.0.0.0/8)
      /^10\./, // Class A private (10.0.0.0/8)
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // Class B private (172.16.0.0/12)
      /^192\.168\./, // Class C private (192.168.0.0/16)
      /^169\.254\./, // Link-local (169.254.0.0/16) - includes cloud metadata
      /^::1$/, // IPv6 loopback
      /^fe80:/, // IPv6 link-local
      /^fc00:/, // IPv6 unique local
      /^fd00:/, // IPv6 unique local
    ];

    return privateRanges.some(range => range.test(ip));
  }

  /**
   * Validate response content type
   */
  private validateContentType(contentType: string): void {
    const cleanContentType = contentType.split(';')[0].trim().toLowerCase();
    
    if (!this.securityConfig.allowedContentTypes.some(allowed => 
      cleanContentType.includes(allowed.toLowerCase())
    )) {
      throw new Error(`Content type ${cleanContentType} is not allowed. Allowed types: ${this.securityConfig.allowedContentTypes.join(', ')}`);
    }
  }

  /**
   * Secure HTTP request with timeout and redirect limits
   */
  private async secureHttpRequest(url: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.securityConfig.requestTimeout);

    try {
      const fetchFn = await getFetch();
      const response = await fetchFn(url, {
        signal: controller.signal,
        redirect: 'manual', // Handle redirects manually for security
        headers: {
          'User-Agent': 'ChimariData-WebAdapter/1.0 (SSRF-Protected)',
          'Accept': this.securityConfig.allowedContentTypes.join(', ')
        }
      });

      clearTimeout(timeoutId);

      // Handle redirects securely
      if (response.status >= 300 && response.status < 400) {
        return await this.handleRedirect(url, response, 0);
      }

      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.securityConfig.requestTimeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Handle redirects with security validation and limits
   */
  private async handleRedirect(originalUrl: string, response: any, redirectCount: number): Promise<any> {
    if (redirectCount >= this.securityConfig.maxRedirects) {
      throw new Error(`Too many redirects (${redirectCount}). Maximum allowed: ${this.securityConfig.maxRedirects}`);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error('Redirect response missing Location header');
    }

    // Validate redirect URL
    const redirectUrl = new URL(location, originalUrl).toString();
    await this.validateUrl(redirectUrl);

    // Follow redirect
    return await this.secureHttpRequest(redirectUrl);
  }

  private extractFileNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const fileName = pathname.split('/').pop() || 'web-data';
      return fileName.includes('.') ? fileName : `${fileName}.json`;
    } catch {
      return 'web-data.json';
    }
  }

  /**
   * Add a domain to the allowlist (for administrative use)
   */
  public addAllowedDomain(domain: string): void {
    if (!this.securityConfig.allowedDomains.includes(domain)) {
      this.securityConfig.allowedDomains.push(domain);
    }
  }

  /**
   * Get current security configuration (for debugging/auditing)
   */
  public getSecurityConfig(): Readonly<WebAdapterSecurityConfig> {
    return { ...this.securityConfig };
  }
}

// ==================== STREAMING DATA INGESTION SYSTEM ====================

/**
 * Configuration interface for streaming data sources
 */
export interface StreamingSourceConfig {
  protocol: 'websocket' | 'sse' | 'poll';
  endpoint: string;
  headers?: Record<string, string>;
  parseSpec: {
    format: 'json' | 'text';
    timestampPath?: string; // JSON path for timestamp field
    dedupeKeyPath?: string; // JSON path for deduplication key
    textDelimiter?: string; // For text format (default: newline)
  };
  batchSize: number; // Records per batch
  flushMs: number; // Max time between flushes
  maxBuffer: number; // Max records to buffer
  pollInterval?: number; // For polling protocol (ms)
  reconnectOptions?: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  authentication?: {
    type: 'bearer' | 'basic' | 'api_key';
    token?: string;
    username?: string;
    password?: string;
    keyHeader?: string; // For API key auth
  };
}

/**
 * Status interface for streaming sources
 */
export interface StreamingStatus {
  isRunning: boolean;
  recordsReceived: number;
  recordsProcessed: number;
  lastRecord?: Date;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  bufferSize: number;
  errorCount: number;
  lastError?: string;
  uptime?: number; // Milliseconds since start
  bytesReceived?: number;
}

/**
 * Interface for parsed streaming records
 */
export interface StreamRecord {
  data: any;
  timestamp: Date;
  dedupeKey?: string;
  sequenceId: string;
  sourceMetadata: {
    protocol: string;
    endpoint: string;
    receivedAt: Date;
    parseFormat: string;
  };
}

/**
 * BatchWriter - Handles micro-batching with backpressure and time-based flushing
 */
export class BatchWriter {
  private buffer: StreamRecord[] = [];
  private lastFlush = Date.now();
  private flushTimer?: NodeJS.Timeout;
  private isFlushingBatch = false;
  private flushPromise?: Promise<void>;

  constructor(
    private config: {
      batchSize: number;
      flushMs: number;
      maxBuffer: number;
    },
    private onFlush: (batch: StreamRecord[]) => Promise<void>,
    private onError: (error: Error) => void
  ) {
    this.scheduleFlushTimer();
  }

  /**
   * Add a record to the batch buffer
   */
  async addRecord(record: StreamRecord): Promise<void> {
    // Backpressure: wait for current flush if buffer is full
    if (this.buffer.length >= this.config.maxBuffer) {
      if (this.flushPromise) {
        await this.flushPromise;
      }
      
      // If still full after flush, drop oldest records (circular buffer behavior)
      if (this.buffer.length >= this.config.maxBuffer) {
        const dropCount = Math.floor(this.config.maxBuffer * 0.1); // Drop 10%
        this.buffer.splice(0, dropCount);
        this.onError(new Error(`Buffer overflow: dropped ${dropCount} oldest records`));
      }
    }

    this.buffer.push(record);

    // Check if we should flush based on size
    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Force flush current buffer
   */
  async flush(): Promise<void> {
    if (this.isFlushingBatch || this.buffer.length === 0) {
      return this.flushPromise || Promise.resolve();
    }

    this.isFlushingBatch = true;
    const batch = this.buffer.splice(0); // Take all records
    this.lastFlush = Date.now();

    this.flushPromise = this.processBatch(batch);
    await this.flushPromise;
    
    this.isFlushingBatch = false;
    this.flushPromise = undefined;
  }

  /**
   * Process a batch of records
   */
  private async processBatch(batch: StreamRecord[]): Promise<void> {
    try {
      await this.onFlush(batch);
    } catch (error: any) {
      this.onError(new Error(`Batch flush failed: ${error.message}`));
      // Re-queue failed records at the front of buffer
      this.buffer.unshift(...batch);
    }
  }

  /**
   * Schedule periodic flush timer
   */
  private scheduleFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(async () => {
      const timeSinceLastFlush = Date.now() - this.lastFlush;
      if (timeSinceLastFlush >= this.config.flushMs && this.buffer.length > 0) {
        await this.flush();
      }
      this.scheduleFlushTimer(); // Reschedule
    }, Math.min(this.config.flushMs, 5000)); // Check at least every 5 seconds
  }

  /**
   * Get current buffer status
   */
  getStatus(): { bufferSize: number; lastFlush: Date; isFlushingBatch: boolean } {
    return {
      bufferSize: this.buffer.length,
      lastFlush: new Date(this.lastFlush),
      isFlushingBatch: this.isFlushingBatch
    };
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    // Final flush
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }
}

/**
 * ConnectionManager - Handles WebSocket, SSE, and HTTP polling connections
 */
export class ConnectionManager {
  private connection?: WebSocket | EventSource;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private lastPollCursor?: string;

  constructor(
    private protocol: 'websocket' | 'sse' | 'poll',
    private endpoint: string,
    private config: StreamingSourceConfig,
    private onData: (data: any) => void,
    private onStatusChange: (status: string) => void,
    private onError: (error: Error) => void
  ) {}

  /**
   * Establish connection based on protocol
   */
  async connect(): Promise<void> {
    try {
      this.onStatusChange('connecting');
      
      switch (this.protocol) {
        case 'websocket':
          await this.connectWebSocket();
          break;
        case 'sse':
          await this.connectSSE();
          break;
        case 'poll':
          await this.startPolling();
          break;
        default:
          throw new Error(`Unsupported protocol: ${this.protocol}`);
      }
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.onStatusChange('connected');
    } catch (error: any) {
      this.onError(new Error(`Connection failed: ${error.message}`));
      this.onStatusChange('error');
      await this.scheduleReconnect();
    }
  }

  /**
   * WebSocket connection handler
   */
  private async connectWebSocket(): Promise<void> {
    const headers = this.buildHeaders();
    
    const WebSocketClass = await getWebSocket();
    const ws = new WebSocketClass(this.endpoint, { headers });
    
    return new Promise((resolve, reject) => {
      ws.on('open', () => {
        this.connection = ws;
        resolve();
      });

      ws.on('message', (data: Buffer) => {
        try {
          const text = data.toString('utf-8');
          const parsed = this.parseIncomingData(text);
          this.onData(parsed);
        } catch (error: any) {
          this.onError(new Error(`WebSocket message parse error: ${error.message}`));
        }
      });

      ws.on('error', (error: Error) => {
        reject(error);
      });

      ws.on('close', () => {
        this.isConnected = false;
        this.onStatusChange('disconnected');
        this.scheduleReconnect();
      });
    });
  }

  /**
   * Server-Sent Events connection handler
   */
  private async connectSSE(): Promise<void> {
    // Node.js SSE implementation using fetch + stream parsing
    const fetchFn = await getFetch();
    
    // Validate URL security before connecting
    await this.validateStreamingUrl(this.endpoint);
    
    const response = await fetchFn(this.endpoint, {
      headers: {
        ...this.buildHeaders(),
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('SSE response body is null');
    }

    // Parse SSE stream using Node.js readable stream
    let buffer = '';
    const stream = response.body;

    const readStream = async (): Promise<void> => {
      try {
        // Handle different stream types for Node.js compatibility
        if (stream.getReader) {
          // Modern fetch API with ReadableStream
          const reader = stream.getReader();
          const decoder = new TextDecoder();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line
            
            for (const line of lines) {
              this.processSseLine(line);
            }
          }
        } else {
          // Node.js stream interface
          stream.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf-8');
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line
            
            for (const line of lines) {
              this.processSseLine(line);
            }
          });

          stream.on('end', () => {
            this.isConnected = false;
            this.onStatusChange('disconnected');
            this.scheduleReconnect();
          });

          stream.on('error', (error: Error) => {
            this.onError(new Error(`SSE stream error: ${error.message}`));
            this.onStatusChange('error');
            this.scheduleReconnect();
          });
        }
      } catch (error: any) {
        this.onError(new Error(`SSE setup error: ${error.message}`));
        this.onStatusChange('error');
        await this.scheduleReconnect();
      }
    };

    this.connection = { 
      close: () => {
        if ('destroy' in stream && typeof stream.destroy === 'function') {
          stream.destroy();
        }
      } 
    } as any;
    readStream();
  }

  /**
   * Process individual SSE line
   */
  private processSseLine(line: string): void {
    if (line.startsWith('data: ')) {
      const data = line.substring(6);
      if (data.trim()) {
        try {
          const parsed = this.parseIncomingData(data);
          this.onData(parsed);
        } catch (error: any) {
          this.onError(new Error(`SSE data parse error: ${error.message}`));
        }
      }
    }
  }

  /**
   * HTTP polling handler
   */
  private async startPolling(): Promise<void> {
    const fetchFn = await getFetch();
    
    const poll = async (): Promise<void> => {
      try {
        const url = this.buildPollUrl();
        
        // Validate URL security before polling
        await this.validateStreamingUrl(url);
        
        const response = await fetchFn(url, {
          headers: this.buildHeaders()
        });

        if (!response.ok) {
          throw new Error(`Poll request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.text();
        if (data.trim()) {
          const parsed = this.parseIncomingData(data);
          this.onData(parsed);
          
          // Update cursor for next poll if applicable
          this.updatePollCursor(parsed);
        }
      } catch (error: any) {
        this.onError(new Error(`Poll error: ${error.message}`));
      }
      
      // Schedule next poll
      if (this.isConnected) {
        this.pollTimer = setTimeout(poll, this.config.pollInterval || 5000);
      }
    };

    await poll(); // Initial poll
  }

  /**
   * Parse incoming data based on format specification
   */
  private parseIncomingData(rawData: string): any {
    const { format, textDelimiter } = this.config.parseSpec;
    
    if (format === 'json') {
      try {
        return JSON.parse(rawData);
      } catch {
        // Try parsing as JSON Lines (multiple JSON objects)
        return rawData.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
      }
    } else {
      // Text format
      const delimiter = textDelimiter || '\n';
      return rawData.split(delimiter)
        .filter(line => line.trim())
        .map(line => ({ text: line }));
    }
  }

  /**
   * Build headers including authentication
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.config.headers,
      'User-Agent': 'ChimariData-StreamingAdapter/1.0'
    };

    if (this.config.authentication) {
      const auth = this.config.authentication;
      switch (auth.type) {
        case 'bearer':
          if (auth.token) {
            headers['Authorization'] = `Bearer ${auth.token}`;
          }
          break;
        case 'basic':
          if (auth.username && auth.password) {
            const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
            headers['Authorization'] = `Basic ${encoded}`;
          }
          break;
        case 'api_key':
          if (auth.keyHeader && auth.token) {
            headers[auth.keyHeader] = auth.token;
          }
          break;
      }
    }

    return headers;
  }

  /**
   * Validate streaming URL for security (SSRF protection)
   */
  private async validateStreamingUrl(url: string): Promise<void> {
    let urlObj: URL;
    
    try {
      urlObj = new URL(url);
    } catch (error) {
      throw new Error('Invalid streaming URL format');
    }

    // 1. Protocol validation - only allow HTTP/HTTPS and WS/WSS
    const allowedProtocols = ['http:', 'https:', 'ws:', 'wss:'];
    if (!allowedProtocols.includes(urlObj.protocol)) {
      throw new Error(`Protocol ${urlObj.protocol} is not allowed for streaming. Only ${allowedProtocols.join(', ')} are permitted`);
    }

    // 2. Domain allowlist validation - use same security config as WebAdapter
    const allowedDomains = [
      'api.github.com',
      'raw.githubusercontent.com',
      'data.gov',
      'api.data.gov',
      'opendata.gov',
      'kaggle.com',
      'data.world',
      'api.census.gov',
      'stream.twitter.com',
      'api.twitter.com',
      'api.slack.com',
      'hooks.slack.com'
    ];
    
    if (!this.isDomainAllowedForStreaming(urlObj.hostname, allowedDomains)) {
      throw new Error(`Domain ${urlObj.hostname} is not in the streaming allowed domains list. Contact administrator to add trusted streaming domains.`);
    }

    // 3. IP address validation to prevent access to private networks
    await this.validateStreamingIpAddress(urlObj.hostname);

    // 4. Port validation - allow standard and common streaming ports
    const port = urlObj.port || (urlObj.protocol.startsWith('https') || urlObj.protocol.startsWith('wss') ? '443' : '80');
    const allowedPorts = ['80', '443', '8080', '8443', '3000', '4000', '5000', '8000'];
    if (!allowedPorts.includes(port)) {
      throw new Error(`Port ${port} is not allowed for streaming. Only ports ${allowedPorts.join(', ')} are permitted`);
    }

    // 5. Path validation - prevent access to sensitive paths
    const path = urlObj.pathname.toLowerCase();
    const suspiciousPaths = ['/admin', '/internal', '/private', '/management', '/actuator', '/health'];
    if (suspiciousPaths.some(suspPath => path.includes(suspPath))) {
      throw new Error(`Access to streaming path ${urlObj.pathname} is not allowed`);
    }
  }

  /**
   * Check if domain is allowed for streaming
   */
  private isDomainAllowedForStreaming(hostname: string, allowedDomains: string[]): boolean {
    const cleanHostname = hostname.toLowerCase();
    
    return allowedDomains.some(allowedDomain => {
      const cleanAllowed = allowedDomain.toLowerCase();
      // Exact match or subdomain match
      return cleanHostname === cleanAllowed || cleanHostname.endsWith('.' + cleanAllowed);
    });
  }

  /**
   * Validate IP address for streaming to prevent access to private networks
   */
  private async validateStreamingIpAddress(hostname: string): Promise<void> {
    const dns = require('dns');
    const { promisify } = require('util');
    const lookup = promisify(dns.lookup);

    // Check if hostname is already an IP address
    if (this.isPrivateIpAddressStreaming(hostname)) {
      throw new Error(`Access to private IP address ${hostname} is not allowed for streaming`);
    }

    // Resolve hostname to IP and check if it's private
    try {
      const result = await lookup(hostname);
      const ipAddress = result.address;
      
      if (this.isPrivateIpAddressStreaming(ipAddress)) {
        throw new Error(`Streaming hostname ${hostname} resolves to private IP address ${ipAddress} which is not allowed`);
      }
    } catch (dnsError: any) {
      throw new Error(`DNS resolution failed for streaming hostname ${hostname}: ${dnsError.message}`);
    }
  }

  /**
   * Check if an IP address is in private/internal ranges for streaming
   */
  private isPrivateIpAddressStreaming(ip: string): boolean {
    // IPv4 private ranges
    const privateRanges = [
      /^127\./, // Loopback (127.0.0.0/8)
      /^10\./, // Class A private (10.0.0.0/8)
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // Class B private (172.16.0.0/12)
      /^192\.168\./, // Class C private (192.168.0.0/16)
      /^169\.254\./, // Link-local (169.254.0.0/16) - includes cloud metadata
      /^::1$/, // IPv6 loopback
      /^fe80:/, // IPv6 link-local
      /^fc00:/, // IPv6 unique local
      /^fd00:/, // IPv6 unique local
    ];

    return privateRanges.some(range => range.test(ip));
  }

  /**
   * Build polling URL with cursor parameter
   */
  private buildPollUrl(): string {
    const url = new URL(this.endpoint);
    if (this.lastPollCursor) {
      url.searchParams.set('cursor', this.lastPollCursor);
    }
    return url.toString();
  }

  /**
   * Update polling cursor from response
   */
  private updatePollCursor(data: any): void {
    if (Array.isArray(data) && data.length > 0) {
      const lastItem = data[data.length - 1];
      // Try to extract cursor/timestamp for next poll
      this.lastPollCursor = lastItem.id || lastItem.timestamp || Date.now().toString();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private async scheduleReconnect(): Promise<void> {
    const reconnectOptions = this.config.reconnectOptions || {
      maxRetries: 10,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2
    };

    if (this.reconnectAttempts >= reconnectOptions.maxRetries) {
      this.onError(new Error(`Max reconnect attempts (${reconnectOptions.maxRetries}) reached`));
      return;
    }

    const delay = Math.min(
      reconnectOptions.initialDelay * Math.pow(reconnectOptions.backoffMultiplier, this.reconnectAttempts),
      reconnectOptions.maxDelay
    );

    this.reconnectAttempts++;
    this.onStatusChange('disconnected');

    this.reconnectTimer = setTimeout(async () => {
      await this.connect();
    }, delay);
  }

  /**
   * Disconnect from the streaming source
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }

    if (this.connection) {
      if (this.protocol === 'websocket' && 'close' in this.connection) {
        (this.connection as WebSocket).close();
      } else if ('close' in this.connection) {
        this.connection.close();
      }
      this.connection = undefined;
    }

    this.onStatusChange('disconnected');
  }

  /**
   * Get connection status
   */
  getStatus(): { isConnected: boolean; reconnectAttempts: number } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

/**
 * Streaming Source Adapter Interface - extends SourceAdapter for continuous streams
 */
export interface StreamingSourceAdapter extends SourceAdapter {
  sourceType: 'stream';
  protocol: 'websocket' | 'sse' | 'poll';
  
  // Lifecycle methods for streaming
  start(config: StreamingSourceConfig, storage: any): Promise<void>;
  stop(): Promise<void>;
  getStatus(): StreamingStatus;
  
  // Override process to handle continuous data
  process(input: SourceInput): Promise<SourceResult>;
}

/**
 * StreamingAdapter - Real-time data ingestion adapter
 */
export class StreamingAdapter implements StreamingSourceAdapter {
  sourceType = 'stream' as const;
  protocol: 'websocket' | 'sse' | 'poll';
  supportedMimeTypes = ['application/json', 'text/plain', 'text/event-stream'];
  supportedExtensions = [];

  private batchWriter?: BatchWriter;
  private connectionManager?: ConnectionManager;
  private isRunning = false;
  private config?: StreamingSourceConfig;
  private storage?: any;
  private datasetId?: string;
  private status: StreamingStatus;
  private startTime?: Date;
  private deduplicationSet = new Set<string>();
  private sequenceCounter = 0;

  constructor(protocol: 'websocket' | 'sse' | 'poll') {
    this.protocol = protocol;
    this.status = {
      isRunning: false,
      recordsReceived: 0,
      recordsProcessed: 0,
      connectionStatus: 'disconnected',
      bufferSize: 0,
      errorCount: 0
    };
  }

  canHandle(mimeType: string, fileName: string): boolean {
    // Streaming adapter is used explicitly, not auto-detected
    return false;
  }

  /**
   * Start streaming with the provided configuration
   */
  async start(config: StreamingSourceConfig, storage: any, datasetId?: string): Promise<void> {
    // Validate streaming endpoint security before starting
    try {
      const connectionManager = new ConnectionManager(
        this.protocol,
        config.endpoint,
        config,
        () => {}, // Dummy handlers for validation
        () => {},
        () => {}
      );
      await (connectionManager as any).validateStreamingUrl(config.endpoint);
    } catch (error: any) {
      throw new Error(`Streaming endpoint security validation failed: ${error.message}`);
    }
    if (this.isRunning) {
      throw new Error('Streaming adapter is already running');
    }
    
    // Additional validation passed, continue with startup

    this.config = config;
    this.storage = storage;
    this.datasetId = datasetId;
    this.startTime = new Date();
    this.isRunning = true;
    this.status.isRunning = true;

    // Initialize batch writer
    this.batchWriter = new BatchWriter(
      {
        batchSize: config.batchSize,
        flushMs: config.flushMs,
        maxBuffer: config.maxBuffer
      },
      this.handleBatchFlush.bind(this),
      this.handleBatchError.bind(this)
    );

    // Initialize connection manager
    this.connectionManager = new ConnectionManager(
      this.protocol,
      config.endpoint,
      config,
      this.handleIncomingData.bind(this),
      this.handleStatusChange.bind(this),
      this.handleConnectionError.bind(this)
    );

    // Start connection
    await this.connectionManager.connect();
  }

  /**
   * Stop the streaming adapter
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.status.isRunning = false;

    // Disconnect connection manager
    if (this.connectionManager) {
      await this.connectionManager.disconnect();
      this.connectionManager = undefined;
    }

    // Flush and destroy batch writer
    if (this.batchWriter) {
      await this.batchWriter.destroy();
      this.batchWriter = undefined;
    }

    this.status.connectionStatus = 'disconnected';
  }

  /**
   * Get current streaming status
   */
  getStatus(): StreamingStatus {
    const now = Date.now();
    const uptime = this.startTime ? now - this.startTime.getTime() : 0;
    
    return {
      ...this.status,
      uptime,
      bufferSize: this.batchWriter?.getStatus().bufferSize || 0
    };
  }

  /**
   * Process method for compatibility (not used in streaming)
   */
  async process(input: SourceInput): Promise<SourceResult> {
    throw new Error('StreamingAdapter.process() should not be called directly. Use start() instead.');
  }

  /**
   * Handle incoming data from the connection
   */
  private async handleIncomingData(rawData: any): Promise<void> {
    try {
      const records = this.parseAndNormalizeData(rawData);
      
      for (const record of records) {
        // Check for duplicates
        if (record.dedupeKey && this.deduplicationSet.has(record.dedupeKey)) {
          continue; // Skip duplicate
        }

        if (record.dedupeKey) {
          this.deduplicationSet.add(record.dedupeKey);
          
          // Limit deduplication set size
          if (this.deduplicationSet.size > 10000) {
            const keys = Array.from(this.deduplicationSet);
            this.deduplicationSet.clear();
            // Keep only the most recent 5000
            keys.slice(-5000).forEach(key => this.deduplicationSet.add(key));
          }
        }

        await this.batchWriter!.addRecord(record);
        this.status.recordsReceived++;
      }
    } catch (error: any) {
      this.handleDataError(new Error(`Data processing error: ${error.message}`));
    }
  }

  /**
   * Parse and normalize incoming data into StreamRecord format
   */
  private parseAndNormalizeData(rawData: any): StreamRecord[] {
    const records: StreamRecord[] = [];
    const dataArray = Array.isArray(rawData) ? rawData : [rawData];

    for (const item of dataArray) {
      const record: StreamRecord = {
        data: item,
        timestamp: this.extractTimestamp(item),
        dedupeKey: this.extractDedupeKey(item),
        sequenceId: `${this.datasetId || 'stream'}-${++this.sequenceCounter}`,
        sourceMetadata: {
          protocol: this.protocol,
          endpoint: this.config!.endpoint,
          receivedAt: new Date(),
          parseFormat: this.config!.parseSpec.format
        }
      };
      
      records.push(record);
    }

    return records;
  }

  /**
   * Extract timestamp from data using configured path
   */
  private extractTimestamp(data: any): Date {
    const timestampPath = this.config?.parseSpec.timestampPath;
    
    if (timestampPath && typeof data === 'object') {
      const timestamp = this.getValueByPath(data, timestampPath);
      if (timestamp) {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    return new Date(); // Default to current time
  }

  /**
   * Extract deduplication key from data using configured path
   */
  private extractDedupeKey(data: any): string | undefined {
    const dedupePath = this.config?.parseSpec.dedupeKeyPath;
    
    if (dedupePath && typeof data === 'object') {
      const key = this.getValueByPath(data, dedupePath);
      return key ? String(key) : undefined;
    }
    
    return undefined;
  }

  /**
   * Get value from object using dot notation path
   */
  private getValueByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Handle batch flush to storage
   */
  private async handleBatchFlush(batch: StreamRecord[]): Promise<void> {
    if (!this.storage || !this.datasetId) {
      throw new Error('Storage or dataset ID not configured');
    }

    try {
      // Create stream chunk for this batch
      const chunkData: InsertStreamChunk = {
        datasetId: this.datasetId,
        seq: Math.floor(Date.now() / 1000), // Use timestamp as sequence
        fromTs: batch[0]?.timestamp || new Date(),
        toTs: batch[batch.length - 1]?.timestamp || new Date(),
        recordCount: batch.length,
        storageUri: `streams/${this.datasetId}/${Date.now()}`,
        checksum: this.calculateBatchChecksum(batch)
      };

      await this.storage.createStreamChunk(chunkData);
      
      // Update checkpoint
      const checkpoint: InsertStreamCheckpoint = {
        sourceId: this.datasetId,
        cursor: batch[batch.length - 1]?.sequenceId || '',
        ts: new Date()
      };

      await this.storage.createStreamCheckpoint(checkpoint);
      
      this.status.recordsProcessed += batch.length;
      this.status.lastRecord = batch[batch.length - 1]?.timestamp;
    } catch (error: any) {
      throw new Error(`Batch storage failed: ${error.message}`);
    }
  }

  /**
   * Calculate checksum for batch integrity
   */
  private calculateBatchChecksum(batch: StreamRecord[]): string {
    const crypto = require('crypto');
    const dataString = JSON.stringify(batch.map(r => r.data));
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Handle batch processing errors
   */
  private handleBatchError(error: Error): void {
    this.status.errorCount++;
    this.status.lastError = error.message;
    console.error('Streaming batch error:', error);
  }

  /**
   * Handle connection status changes
   */
  private handleStatusChange(status: string): void {
    this.status.connectionStatus = status as any;
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Error): void {
    this.status.errorCount++;
    this.status.lastError = error.message;
    this.status.connectionStatus = 'error';
    console.error('Streaming connection error:', error);
  }

  /**
   * Handle data processing errors
   */
  private handleDataError(error: Error): void {
    this.status.errorCount++;
    this.status.lastError = error.message;
    console.error('Streaming data error:', error);
  }
}

/**
 * Source Adapter Manager - factory for creating appropriate adapters
 */
export class SourceAdapterManager {
  private adapters: SourceAdapter[] = [
    new CsvAdapter(),
    new JsonAdapter(),
    new ExcelAdapter(),
    new PdfAdapter(),
    new WebAdapter()
  ];

  private streamingAdapters: Map<string, StreamingAdapter> = new Map();

  /**
   * Get the appropriate adapter for a given input
   */
  getAdapter(input: SourceInput): SourceAdapter {
    // For web sources
    if (input.url) {
      return new WebAdapter();
    }

    // For file uploads
    if (input.buffer && input.fileName && input.mimeType) {
      const adapter = this.adapters.find(adapter => 
        adapter.canHandle(input.mimeType!, input.fileName!)
      );
      
      if (!adapter) {
        throw new Error(`No adapter found for file type: ${input.mimeType}`);
      }
      
      return adapter;
    }

    throw new Error('Invalid input: requires either URL or buffer with fileName and mimeType');
  }

  /**
   * Create a new streaming adapter for real-time data ingestion
   */
  createStreamingAdapter(protocol: 'websocket' | 'sse' | 'poll', id?: string): StreamingAdapter {
    const adapterId = id || nanoid();
    const adapter = new StreamingAdapter(protocol);
    this.streamingAdapters.set(adapterId, adapter);
    return adapter;
  }

  /**
   * Get a streaming adapter by ID
   */
  getStreamingAdapter(id: string): StreamingAdapter | undefined {
    return this.streamingAdapters.get(id);
  }

  /**
   * Start a streaming adapter with configuration
   */
  async startStreamingAdapter(
    id: string, 
    config: StreamingSourceConfig, 
    storage: any, 
    datasetId?: string
  ): Promise<void> {
    const adapter = this.streamingAdapters.get(id);
    if (!adapter) {
      throw new Error(`Streaming adapter not found: ${id}`);
    }
    
    await adapter.start(config, storage, datasetId);
  }

  /**
   * Stop a streaming adapter
   */
  async stopStreamingAdapter(id: string): Promise<void> {
    const adapter = this.streamingAdapters.get(id);
    if (!adapter) {
      throw new Error(`Streaming adapter not found: ${id}`);
    }
    
    await adapter.stop();
    this.streamingAdapters.delete(id);
  }

  /**
   * Get status of all streaming adapters
   */
  getStreamingStatus(): Record<string, StreamingStatus> {
    const status: Record<string, StreamingStatus> = {};
    this.streamingAdapters.forEach((adapter, id) => {
      status[id] = adapter.getStatus();
    });
    return status;
  }

  /**
   * Stop all streaming adapters (cleanup)
   */
  async stopAllStreamingAdapters(): Promise<void> {
    const stopPromises = Array.from(this.streamingAdapters.entries()).map(
      async ([id, adapter]) => {
        try {
          await adapter.stop();
        } catch (error: any) {
          console.error(`Error stopping streaming adapter ${id}:`, error);
        }
      }
    );
    
    await Promise.all(stopPromises);
    this.streamingAdapters.clear();
  }

  /**
   * Process input using the appropriate adapter
   */
  async processInput(input: SourceInput): Promise<SourceResult> {
    const adapter = this.getAdapter(input);
    return await adapter.process(input);
  }

  /**
   * Get supported file types for upload validation
   */
  getSupportedFileTypes(): { mimeTypes: string[], extensions: string[] } {
    const mimeTypes = new Set<string>();
    const extensions = new Set<string>();

    this.adapters.forEach(adapter => {
      adapter.supportedMimeTypes.forEach(type => mimeTypes.add(type));
      adapter.supportedExtensions.forEach(ext => extensions.add(ext));
    });

    return {
      mimeTypes: Array.from(mimeTypes),
      extensions: Array.from(extensions)
    };
  }
}

// Export singleton instance
export const sourceAdapterManager = new SourceAdapterManager();