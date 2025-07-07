import * as XLSX from 'xlsx';
import { DataProject } from '@shared/schema';

export interface ProcessedFileData {
  schema: Record<string, {
    type: string;
    nullable: boolean;
    sampleValues: string[];
    description: string;
  }>;
  recordCount: number;
  preview: Record<string, any>[];
}

export class FileProcessor {
  
  static async processFile(buffer: Buffer, fileName: string, mimeType: string): Promise<ProcessedFileData> {
    let data: any[] = [];
    
    try {
      if (mimeType.includes('json') || fileName.endsWith('.json')) {
        data = FileProcessor.processJSON(buffer);
      } else if (mimeType.includes('csv') || fileName.endsWith('.csv')) {
        data = FileProcessor.processCSV(buffer);
      } else if (mimeType.includes('excel') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        data = FileProcessor.processExcel(buffer);
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }

      const schema = FileProcessor.detectSchema(data);
      const preview = data.slice(0, 10); // First 10 rows for preview
      
      return {
        schema,
        recordCount: data.length,
        preview
      };
    } catch (error) {
      throw new Error(`Failed to process file: ${error.message}`);
    }
  }

  private static processJSON(buffer: Buffer): any[] {
    const jsonString = buffer.toString('utf-8');
    const parsed = JSON.parse(jsonString);
    
    // Handle different JSON structures
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      // If it's an object with an array property, try to find the data array
      for (const key in parsed) {
        if (Array.isArray(parsed[key])) {
          return parsed[key];
        }
      }
      // If no array found, wrap the object in an array
      return [parsed];
    }
    
    throw new Error('JSON file does not contain valid data structure');
  }

  private static processCSV(buffer: Buffer): any[] {
    const csvString = buffer.toString('utf-8');
    const lines = csvString.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      data.push(row);
    }

    return data;
  }

  private static processExcel(buffer: Buffer): any[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length === 0) {
      throw new Error('Excel file is empty');
    }

    const headers = data[0] as string[];
    const rows = data.slice(1) as any[][];
    
    return rows.map(row => {
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });
  }

  private static detectSchema(data: any[]): Record<string, {
    type: string;
    nullable: boolean;
    sampleValues: string[];
    description: string;
  }> {
    if (data.length === 0) {
      return {};
    }

    const schema: Record<string, {
      type: string;
      nullable: boolean;
      sampleValues: string[];
      description: string;
    }> = {};

    const sampleRow = data[0];
    const sampleSize = Math.min(data.length, 100); // Analyze first 100 rows
    
    for (const key in sampleRow) {
      const values = data.slice(0, sampleSize).map(row => row[key]).filter(v => v !== null && v !== undefined && v !== '');
      const nullCount = sampleSize - values.length;
      
      const type = FileProcessor.inferType(values);
      const sampleValues = [...new Set(values.slice(0, 5))].map(v => String(v));
      
      schema[key] = {
        type,
        nullable: nullCount > 0,
        sampleValues,
        description: `${key} (${values.length} non-null values)`
      };
    }

    return schema;
  }

  private static inferType(values: any[]): string {
    if (values.length === 0) return 'text';
    
    const numericCount = values.filter(v => !isNaN(Number(v)) && v !== '').length;
    const dateCount = values.filter(v => !isNaN(Date.parse(v))).length;
    
    if (numericCount / values.length > 0.8) {
      return 'number';
    } else if (dateCount / values.length > 0.8) {
      return 'date';
    } else {
      return 'text';
    }
  }
}