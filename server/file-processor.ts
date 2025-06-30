import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
// Removed iconv-lite dependency - using native Node.js encoding

export interface FileProcessingResult {
  data: any[];
  schema: Record<string, string>;
  metadata: {
    filename: string;
    fileSize: number;
    sheetNames?: string[];
    selectedSheet?: string;
    headerRow: number;
    recordCount: number;
    encoding?: string;
  };
  dataSnapshot: any[]; // First 100 rows for AI analysis
}

export interface ProcessingOptions {
  selectedSheet?: string;
  headerRow?: number;
  maxRows?: number;
  encoding?: string;
}

export class FileProcessor {
  private static readonly MAX_SAMPLE_SIZE = 100;
  private static readonly MAX_HEADER_SEARCH_ROWS = 10;

  /**
   * Process uploaded file and extract data with smart header detection
   */
  static async processFile(
    filePath: string,
    originalName: string,
    options: ProcessingOptions = {}
  ): Promise<FileProcessingResult> {
    const fileExtension = path.extname(originalName).toLowerCase();
    
    // Validate file exists and is readable
    if (!fs.existsSync(filePath)) {
      throw new Error('Uploaded file not found');
    }
    
    const fileSize = fs.statSync(filePath).size;
    
    // Check file size limits
    if (fileSize === 0) {
      throw new Error('File is empty');
    }
    
    if (fileSize > 100 * 1024 * 1024) { // 100MB limit for better large dataset support
      throw new Error('File size exceeds 100MB limit');
    }

    try {
      switch (fileExtension) {
        case '.xlsx':
        case '.xls':
          return await this.processExcelFile(filePath, originalName, fileSize, options);
        case '.csv':
          return await this.processCsvFile(filePath, originalName, fileSize, options);
        default:
          throw new Error(`Unsupported file format: ${fileExtension}. Please upload CSV or Excel files only.`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      throw new Error(`File processing failed: ${errorMessage}`);
    }
  }

  /**
   * Process Excel files with multi-sheet support and flexible header detection
   */
  private static async processExcelFile(
    filePath: string,
    originalName: string,
    fileSize: number,
    options: ProcessingOptions
  ): Promise<FileProcessingResult> {
    let workbook;
    try {
      // Validate file is actually an Excel file by checking magic bytes
      const fileBuffer = fs.readFileSync(filePath);
      
      // Check for Excel file signatures
      const isXLSX = fileBuffer.slice(0, 4).toString('hex') === '504b0304'; // ZIP signature for XLSX
      const isXLS = fileBuffer.slice(0, 8).toString('hex').startsWith('d0cf11e0a1b11ae1'); // OLE signature for XLS
      
      if (!isXLSX && !isXLS) {
        throw new Error('File is not a valid Excel format. Please ensure the file is properly saved as .xlsx or .xls');
      }
      
      workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: false, cellHTML: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error reading Excel file';
      throw new Error(`Excel file processing failed: ${errorMessage}`);
    }
    const sheetNames = workbook.SheetNames;

    if (sheetNames.length === 0) {
      throw new Error('No sheets found in Excel file');
    }

    // Select sheet: user preference > first non-empty sheet > first sheet
    let selectedSheet = options.selectedSheet || this.findBestSheet(workbook, sheetNames);
    if (!sheetNames.includes(selectedSheet)) {
      selectedSheet = sheetNames[0];
    }

    const worksheet = workbook.Sheets[selectedSheet];
    
    // Convert sheet to JSON with header detection
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    if (!rawData || rawData.length === 0) {
      throw new Error(`Selected sheet "${selectedSheet}" is empty`);
    }

    // Smart header detection
    const headerInfo = this.detectHeaders(rawData as any[][], options.headerRow);
    const headerRow = headerInfo.headerRow;
    const headers = headerInfo.headers;

    // Extract data starting from after header row
    const dataRows = (rawData as any[][]).slice(headerRow + 1);
    const processedData = this.convertToObjects(headers, dataRows);

    // Generate schema
    const schema = this.generateSchema(processedData);

    // Create data snapshot for AI analysis
    const dataSnapshot = processedData.slice(0, this.MAX_SAMPLE_SIZE);

    return {
      data: processedData,
      schema,
      metadata: {
        filename: originalName,
        fileSize,
        sheetNames,
        selectedSheet,
        headerRow,
        recordCount: processedData.length,
      },
      dataSnapshot,
    };
  }

  /**
   * Process CSV files with encoding detection and flexible header detection
   */
  private static async processCsvFile(
    filePath: string,
    originalName: string,
    fileSize: number,
    options: ProcessingOptions
  ): Promise<FileProcessingResult> {
    // Detect encoding
    const buffer = fs.readFileSync(filePath);
    const encoding = options.encoding || this.detectEncoding(buffer);
    
    // Read and parse CSV
    const csvContent = buffer.toString(encoding === 'utf8' ? 'utf8' : 'latin1');
    const lines = csvContent.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Parse CSV manually to handle header detection
    const rawData = lines.map(line => this.parseCsvLine(line));
    
    // Smart header detection
    const headerInfo = this.detectHeaders(rawData, options.headerRow);
    const headerRow = headerInfo.headerRow;
    const headers = headerInfo.headers;

    // Extract data starting from after header row
    const dataRows = rawData.slice(headerRow + 1);
    const processedData = this.convertToObjects(headers, dataRows);

    // Generate schema
    const schema = this.generateSchema(processedData);

    // Create data snapshot for AI analysis
    const dataSnapshot = processedData.slice(0, this.MAX_SAMPLE_SIZE);

    return {
      data: processedData,
      schema,
      metadata: {
        filename: originalName,
        fileSize,
        headerRow,
        recordCount: processedData.length,
        encoding,
      },
      dataSnapshot,
    };
  }

  /**
   * Smart header detection - finds the most likely header row
   */
  private static detectHeaders(rawData: any[][], specifiedHeaderRow?: number): {
    headerRow: number;
    headers: string[];
  } {
    if (specifiedHeaderRow !== undefined) {
      if (specifiedHeaderRow < 0 || specifiedHeaderRow >= rawData.length) {
        throw new Error(`Invalid header row: ${specifiedHeaderRow}`);
      }
      return {
        headerRow: specifiedHeaderRow,
        headers: this.cleanHeaders(rawData[specifiedHeaderRow]),
      };
    }

    // Search for the best header row within the first MAX_HEADER_SEARCH_ROWS
    const searchLimit = Math.min(this.MAX_HEADER_SEARCH_ROWS, rawData.length);
    let bestScore = -1;
    let bestHeaderRow = 0;

    for (let i = 0; i < searchLimit; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const score = this.scoreHeaderRow(row, rawData, i);
      if (score > bestScore) {
        bestScore = score;
        bestHeaderRow = i;
      }
    }

    return {
      headerRow: bestHeaderRow,
      headers: this.cleanHeaders(rawData[bestHeaderRow]),
    };
  }

  /**
   * Score a potential header row based on various criteria
   */
  private static scoreHeaderRow(row: any[], allData: any[][], rowIndex: number): number {
    let score = 0;

    // Check if values look like headers (text, not numbers)
    const textCount = row.filter(cell => 
      typeof cell === 'string' && 
      cell.trim().length > 0 && 
      isNaN(Number(cell))
    ).length;
    score += textCount * 2;

    // Penalty for empty cells
    const emptyCount = row.filter(cell => !cell || cell.toString().trim() === '').length;
    score -= emptyCount;

    // Check uniqueness of values (headers should be unique)
    const uniqueValues = new Set(row.filter(cell => cell && cell.toString().trim()));
    if (uniqueValues.size === row.filter(cell => cell && cell.toString().trim()).length) {
      score += 5; // Bonus for all unique values
    }

    // Check if subsequent rows have different data types (indicates this is header)
    if (rowIndex < allData.length - 1) {
      const nextRow = allData[rowIndex + 1];
      const differentTypes = row.some((headerCell, i) => {
        const dataCell = nextRow[i];
        return headerCell && dataCell && 
               typeof headerCell === 'string' && 
               !isNaN(Number(dataCell)) &&
               isNaN(Number(headerCell));
      });
      if (differentTypes) score += 3;
    }

    return score;
  }

  /**
   * Clean and normalize header names
   */
  private static cleanHeaders(headers: any[]): string[] {
    return headers.map((header, index) => {
      if (!header || header.toString().trim() === '') {
        return `Column_${index + 1}`;
      }
      
      let cleaned = header.toString().trim();
      
      // Remove common header formatting
      cleaned = cleaned.replace(/[\r\n\t]/g, ' ');
      cleaned = cleaned.replace(/\s+/g, ' ');
      
      // Ensure it's a valid identifier
      if (cleaned.length === 0) {
        cleaned = `Column_${index + 1}`;
      }
      
      return cleaned;
    });
  }

  /**
   * Convert raw data rows to objects using headers
   */
  private static convertToObjects(headers: string[], dataRows: any[][]): any[] {
    return dataRows
      .filter(row => row && row.some(cell => cell !== null && cell !== undefined && cell.toString().trim() !== ''))
      .map(row => {
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });
  }

  /**
   * Generate schema by analyzing data types
   */
  private static generateSchema(data: any[]): Record<string, string> {
    if (data.length === 0) return {};

    const schema: Record<string, string> = {};
    const sampleSize = Math.min(100, data.length);
    const sample = data.slice(0, sampleSize);

    Object.keys(data[0] || {}).forEach(key => {
      const values = sample.map(row => row[key]).filter(val => val !== null && val !== undefined && val !== '');
      
      if (values.length === 0) {
        schema[key] = 'text';
        return;
      }

      // Analyze data types
      const numberCount = values.filter(val => !isNaN(Number(val)) && val !== '').length;
      const dateCount = values.filter(val => this.isDate(val)).length;
      const booleanCount = values.filter(val => this.isBoolean(val)).length;

      const total = values.length;
      
      if (numberCount / total > 0.8) {
        schema[key] = this.hasDecimals(values) ? 'decimal' : 'integer';
      } else if (dateCount / total > 0.6) {
        schema[key] = 'date';
      } else if (booleanCount / total > 0.8) {
        schema[key] = 'boolean';
      } else {
        schema[key] = 'text';
      }
    });

    return schema;
  }

  /**
   * Find the best sheet in Excel workbook (first non-empty sheet with data)
   */
  private static findBestSheet(workbook: XLSX.WorkBook, sheetNames: string[]): string {
    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (data && data.length > 1) {
        return sheetName;
      }
    }
    return sheetNames[0];
  }

  /**
   * Detect file encoding
   */
  private static detectEncoding(buffer: Buffer): string {
    // Simple encoding detection - can be enhanced
    const sample = buffer.slice(0, 1000).toString('utf8');
    if (sample.includes('�')) {
      return 'latin1';
    }
    return 'utf8';
  }

  /**
   * Parse CSV line handling quoted values
   */
  private static parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  /**
   * Check if value is a date
   */
  private static isDate(value: any): boolean {
    if (!value) return false;
    const dateRegex = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/;
    return dateRegex.test(value.toString()) || !isNaN(Date.parse(value.toString()));
  }

  /**
   * Check if value is boolean
   */
  private static isBoolean(value: any): boolean {
    if (!value) return false;
    const str = value.toString().toLowerCase();
    return ['true', 'false', 'yes', 'no', '1', '0', 'y', 'n'].includes(str);
  }

  /**
   * Check if numeric values contain decimals
   */
  private static hasDecimals(values: any[]): boolean {
    return values.some(val => {
      const num = Number(val);
      return !isNaN(num) && num % 1 !== 0;
    });
  }
}