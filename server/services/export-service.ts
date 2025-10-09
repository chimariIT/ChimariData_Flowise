
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import PptxGenJS from 'pptxgenjs';

// Minimal AnalysisResult shape used by exports to avoid tight coupling
type AnalysisResult = {
  title: string;
  sections: Array<{ title: string; content: string }>;
};

class ExportService {
  public async generatePdf(analysisResult: AnalysisResult): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;

    let y = height - 40;
    const margin = 50;
    const textWidth = width - 2 * margin;

    const drawText = (text: string, options: { font: any; size: number; x: number; y: number; color?: any; maxWidth?: number }) => {
      page.drawText(text, options);
      y -= options.size * 1.5; // Adjust line height
    };

    drawText('Analysis Report', { font, size: 24, x: margin, y });

    y -= 20;

    drawText(`Title: ${analysisResult.title}`, { font, size: fontSize, x: margin, y, maxWidth: textWidth });
    drawText(`Generated on: ${new Date().toLocaleDateString()}`, { font, size: fontSize, x: margin, y, maxWidth: textWidth });
    
    y -= 10;

    analysisResult.sections.forEach(section => {
      drawText(section.title, { font, size: 16, x: margin, y, color: rgb(0.1, 0.5, 0.8) });
      drawText(section.content, { font, size: fontSize, x: margin, y, maxWidth: textWidth });
      y -= 10;
    });

    return pdfDoc.save();
  }

  public async generatePptx(analysisResult: AnalysisResult): Promise<ArrayBuffer> {
    const pptx = new PptxGenJS();

    const titleSlide = pptx.addSlide();
    titleSlide.addText(analysisResult.title, { x: 1, y: 1, w: '80%', h: 1, fontSize: 36, align: 'center' });
    titleSlide.addText(`Generated on: ${new Date().toLocaleDateString()}`, { x: 1, y: 2.5, w: '80%', h: 0.5, fontSize: 18, align: 'center' });

    analysisResult.sections.forEach(section => {
      const slide = pptx.addSlide();
      slide.addText(section.title, { x: 0.5, y: 0.5, w: '90%', h: 1, fontSize: 24 });
      slide.addText(section.content, { x: 0.5, y: 1.5, w: '90%', h: '75%', fontSize: 14 });
    });

    // Generate ArrayBuffer for server-side response
  // In Node, pptxgen supports outputting a Buffer via stream or returning base64 string.
  // Use base64 and convert to ArrayBuffer safely.
  const base64: string = await (pptx as any).write({ outputType: 'base64' });
  const buf: Buffer = Buffer.from(base64, 'base64');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return ab as ArrayBuffer;
  }
}

export const exportService = new ExportService();
