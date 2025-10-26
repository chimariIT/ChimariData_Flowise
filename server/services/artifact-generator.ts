import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface ArtifactConfig {
  projectId: string;
  userId: string;
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation';
  analysisResults: any[];
  visualizations: any[];
  insights: string[];
  datasetSizeMB: number;
}

export interface GeneratedArtifacts {
  dashboard: { url: string; filters: any[] };
  pdf: { url: string; filename: string; sizeMB: number };
  presentation: { url: string; filename: string; sizeMB: number };
  csv: { url: string; filename: string; sizeMB: number };
  json?: { url: string; filename: string; sizeMB: number };
  totalSizeMB: number;
  totalCost: number; // Calculated cost
}

export class ArtifactGenerator {

  /**
   * Generate all artifacts and track billing
   */
  async generateArtifacts(config: ArtifactConfig): Promise<GeneratedArtifacts> {
    const { projectId, userId, journeyType, analysisResults, visualizations, insights } = config;

    // Import billing service
    const { getBillingService } = await import('./billing/unified-billing-service');
    const billingService = getBillingService();

    const artifacts: Partial<GeneratedArtifacts> = {};
    let totalCost = 0;
    let totalSizeMB = 0;

    // 1. Dashboard (always, no file size)
    artifacts.dashboard = await this.generateDashboard(config);

    // 2. PDF Report
    const pdfResult = await this.generatePDFReport(config);
    artifacts.pdf = pdfResult;
    totalSizeMB += pdfResult.sizeMB;

    // Track in billing
    await billingService.trackFeatureUsage(userId, 'pdf_report', this.detectComplexity(visualizations.length, insights.length), pdfResult.sizeMB);
    totalCost += await this.calculateArtifactCost(userId, 'pdf_report', pdfResult.sizeMB);

    // 3. Presentation
    const pptxResult = await this.generatePresentation(config);
    artifacts.presentation = pptxResult;
    totalSizeMB += pptxResult.sizeMB;

    await billingService.trackFeatureUsage(userId, 'presentation', this.detectComplexity(visualizations.length, insights.length), pptxResult.sizeMB);
    totalCost += await this.calculateArtifactCost(userId, 'presentation', pptxResult.sizeMB);

    // 4. CSV Export
    const csvResult = await this.generateCSVData(config);
    artifacts.csv = csvResult;
    totalSizeMB += csvResult.sizeMB;

    await billingService.trackFeatureUsage(userId, 'csv_export', 'small', csvResult.sizeMB);
    totalCost += await this.calculateArtifactCost(userId, 'csv_export', csvResult.sizeMB);

    // 5. JSON (only for business/technical/consultation)
    if (journeyType !== 'non-tech') {
      const jsonResult = await this.generateJSONData(config);
      artifacts.json = jsonResult;
      totalSizeMB += jsonResult.sizeMB;

      await billingService.trackFeatureUsage(userId, 'json_export', 'small', jsonResult.sizeMB);
      totalCost += await this.calculateArtifactCost(userId, 'json_export', jsonResult.sizeMB);
    }

    console.log(`💰 Total artifact cost for user ${userId}: $${totalCost / 100}`);

    return {
      ...artifacts,
      totalSizeMB,
      totalCost
    } as GeneratedArtifacts;
  }

  private async generateDashboard(config: ArtifactConfig) {
    return {
      url: `/dashboard/${config.projectId}`,
      filters: this.detectFilters(config.analysisResults)
    };
  }

  private async generatePDFReport(config: ArtifactConfig) {
    const doc = new jsPDF();
    const filename = `${config.projectId}-report.pdf`;
    const outputPath = path.join(process.cwd(), 'uploads', 'artifacts', filename);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Title
    doc.setFontSize(20);
    doc.text('Analysis Report', 20, 20);

    // Insights
    doc.setFontSize(12);
    let yPos = 40;
    config.insights.forEach((insight, i) => {
      doc.text(`${i + 1}. ${insight}`, 20, yPos);
      yPos += 10;
    });

    doc.save(outputPath);

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);

    return {
      url: `/artifacts/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private async generatePresentation(config: ArtifactConfig) {
    const filename = `${config.projectId}-presentation.pptx`;
    // TODO: Use pptxgenjs library for real PPTX generation
    // For now, placeholder
    return {
      url: `/artifacts/${filename}`,
      filename,
      sizeMB: 0.5 // Estimated
    };
  }

  private async generateCSVData(config: ArtifactConfig) {
    const filename = `${config.projectId}-data.csv`;
    const outputPath = path.join(process.cwd(), 'uploads', 'artifacts', filename);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const worksheet = XLSX.utils.json_to_sheet(config.analysisResults);
    const csv = XLSX.utils.sheet_to_csv(worksheet);

    fs.writeFileSync(outputPath, csv);

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);

    return {
      url: `/artifacts/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private async generateJSONData(config: ArtifactConfig) {
    const filename = `${config.projectId}-data.json`;
    const outputPath = path.join(process.cwd(), 'uploads', 'artifacts', filename);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const jsonData = {
      projectId: config.projectId,
      timestamp: new Date().toISOString(),
      results: config.analysisResults,
      metadata: { engine: 'python-spark-hybrid' }
    };

    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2));

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);

    return {
      url: `/artifacts/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private detectFilters(data: any[]) {
    // Basic filter detection
    return [{ type: 'search', label: 'Search', column: '_all' }];
  }

  private detectComplexity(vizCount: number, insightCount: number): string {
    const score = vizCount + (insightCount / 2);
    if (score < 5) return 'small';
    if (score < 10) return 'medium';
    if (score < 20) return 'large';
    return 'extra_large';
  }

  private async calculateArtifactCost(userId: string, artifactType: string, sizeMB: number): Promise<number> {
    // Base pricing (in cents)
    const basePrices: Record<string, number> = {
      'pdf_report': 50,        // $0.50 base
      'presentation': 100,     // $1.00 base
      'dashboard': 0,          // Included (no file)
      'csv_export': 10,        // $0.10 base
      'json_export': 10        // $0.10 base
    };

    const basePrice = basePrices[artifactType] || 0;

    // Size multiplier (larger files cost more)
    const sizeMultiplier = sizeMB > 10 ? 2 : sizeMB > 5 ? 1.5 : 1;

    const finalPrice = basePrice * sizeMultiplier;

    return Math.round(finalPrice);
  }
}
