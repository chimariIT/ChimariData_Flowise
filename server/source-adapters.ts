import * as XLSX from 'xlsx';
import { Dataset, InsertDataset } from '@shared/schema';
import { nanoid } from 'nanoid';

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
  private async secureHttpRequest(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.securityConfig.requestTimeout);

    try {
      const response = await fetch(url, {
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
  private async handleRedirect(originalUrl: string, response: Response, redirectCount: number): Promise<Response> {
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