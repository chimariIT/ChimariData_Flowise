import * as XLSX from 'xlsx';

export interface ProcessedData {
  preview: any[];
  schema: Record<string, {
    type: string;
    nullable: boolean;
    sampleValues: string[];
    description?: string;
  }>;
  recordCount: number;
}

export class FileProcessor {
  static async processFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<ProcessedData> {
    try {
      let data: any[] = [];
      
      // Process based on file type
      if (mimeType === 'application/json' || fileName.toLowerCase().endsWith('.json')) {
        data = this.processJSON(buffer);
      } else if (mimeType === 'text/csv' || fileName.toLowerCase().endsWith('.csv')) {
        data = this.processCSV(buffer);
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        fileName.toLowerCase().endsWith('.xlsx') ||
        fileName.toLowerCase().endsWith('.xls')
      ) {
        data = this.processExcel(buffer);
      } else if (mimeType === 'text/plain' || fileName.toLowerCase().endsWith('.txt')) {
        data = this.processText(buffer);
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No data found in file');
      }

      // Generate schema and preview
      const schema = this.generateSchema(data);
      const preview = data.slice(0, 100); // First 100 rows for preview
      
      return {
        preview,
        schema,
        recordCount: data.length
      };
    } catch (error) {
      throw new Error(`File processing failed: ${error.message}`);
    }
  }

  private static processJSON(buffer: Buffer): any[] {
    const text = buffer.toString('utf-8');
    const parsed = JSON.parse(text);
    
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (typeof parsed === 'object') {
      // If it's a single object, wrap it in an array
      return [parsed];
    } else {
      throw new Error('JSON file must contain an array or object');
    }
  }

  private static processCSV(buffer: Buffer): any[] {
    const text = buffer.toString('utf-8');
    return this.parseCSVFallback(text);
  }

  private static parseCSVFallback(text: string): any[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      
      headers.forEach((header, index) => {
        const value = values[index] || '';
        // Try to convert to number if possible
        const numValue = parseFloat(value);
        row[header] = !isNaN(numValue) && value !== '' ? numValue : value;
      });
      
      data.push(row);
    }
    
    return data;
  }

  private static processExcel(buffer: Buffer): any[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    
    if (!sheetName) {
      throw new Error('No sheets found in Excel file');
    }
    
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: null 
    });
    
    if (data.length < 2) {
      throw new Error('Excel file must have at least a header row and one data row');
    }
    
    // Convert to objects with headers
    const headers = data[0] as string[];
    const rows = data.slice(1) as any[][];
    
    return rows.map(row => {
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] !== undefined ? row[index] : null;
      });
      return obj;
    });
  }

  private static processText(buffer: Buffer): any[] {
    const text = buffer.toString('utf-8');
    const lines = text.split('\n').filter(line => line.trim());
    
    // Simple heuristic: if it looks like CSV, process as CSV
    if (lines.some(line => line.includes(',') || line.includes('\t'))) {
      return this.parseCSVFallback(text);
    }
    
    // Otherwise, treat each line as a text record
    return lines.map((line, index) => ({
      line_number: index + 1,
      content: line.trim()
    }));
  }

  private static generateSchema(data: any[]): Record<string, {
    type: string;
    nullable: boolean;
    sampleValues: string[];
    description?: string;
  }> {
    if (data.length === 0) {
      return {};
    }

    const schema: Record<string, any> = {};
    const sampleSize = Math.min(data.length, 100);
    const sampleData = data.slice(0, sampleSize);

    // Get all possible keys
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
      
      // Determine type
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

      // Get sample values (first 5 unique non-null values)
      const uniqueValues = [...new Set(values.map(v => String(v)))];
      const sampleValues = uniqueValues.slice(0, 5);

      schema[key] = {
        type,
        nullable,
        sampleValues
      };
    });

    return schema;
  }

  private static isDate(value: any): boolean {
    if (typeof value === 'string') {
      const date = new Date(value);
      return !isNaN(date.getTime()) && value.length > 8;
    }
    return false;
  }

  private static isEmail(value: any): boolean {
    if (typeof value === 'string') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    return false;
  }

  private static isUrl(value: any): boolean {
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
}