declare module 'pdf-parse' {
  export interface PDFInfo {
    Producer?: string;
    Creator?: string;
    CreationDate?: string;
    ModDate?: string;
    Title?: string;
    Author?: string;
    [key: string]: any;
  }

  export interface PDFMetadata {
    has(key: string): boolean;
    get(key: string): any;
    metadata: unknown;
  }

  export interface PDFPage {
    pageText: string;
    n: number;
    stats: {
      stat: string;
    };
  }

  export interface PDFParseOptions {
    pagerender?: (pageData: any) => Promise<string> | string;
    max?: number;
    version?: string;
  }

  export interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata?: PDFMetadata;
    version: string;
    text: string;
  }

  function pdfParse(dataBuffer: Buffer | Uint8Array | ArrayBuffer, options?: PDFParseOptions): Promise<PDFParseResult>;

  export = pdfParse;
}
