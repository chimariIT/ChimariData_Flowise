import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../db';
import { projectArtifacts, generatedArtifacts } from '../../shared/schema';
import { nanoid } from 'nanoid';

export interface ArtifactConfig {
  projectId: string;
  projectName?: string; // Project name for folder structure
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
   * Sanitize project name for filesystem use
   */
  private sanitizeProjectName(name: string): string {
    // Remove special characters, replace spaces with underscores, limit length
    return name
      .replace(/[^a-zA-Z0-9\s_-]/g, '') // Remove special chars except spaces, dashes, underscores
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 100) // Limit length
      .trim();
  }

  /**
   * Get artifact directory path (test folder with project name)
   */
  private getArtifactDirectory(config: ArtifactConfig): string {
    const projectId = config.projectId;
    const artifactDir = path.join(process.cwd(), 'uploads', 'artifacts', projectId);
    console.log(`📁 [ARTIFACTS] Saving artifacts to: ${artifactDir}`);
    return artifactDir;
  }

  /**
   * Generate all artifacts and track billing
   */
  async generateArtifacts(config: ArtifactConfig): Promise<GeneratedArtifacts> {
    const { projectId, userId, journeyType, analysisResults, visualizations, insights } = config;

    // Import billing service
    const { getBillingService } = await import('./billing/unified-billing-service');
    const billingService = getBillingService();

    const artifacts: Partial<GeneratedArtifacts> = {};
    const artifactSummaries: Array<{
      key: 'pdf' | 'presentation' | 'csv' | 'json' | 'dashboard';
      title: string;
      format: string;
      filename?: string;
      url?: string;
      sizeMB?: number;
      metadata?: Record<string, any>;
    }> = [];
    let totalCost = 0;
    let totalSizeMB = 0;

    // 1. Dashboard (always, no file size)
    artifacts.dashboard = await this.generateDashboard(config);
    artifactSummaries.push({
      key: 'dashboard',
      title: 'Interactive Dashboard Link',
      format: 'dashboard',
      url: artifacts.dashboard.url,
      metadata: {
        filters: artifacts.dashboard.filters,
        stepId: 'analysis_execution',
        generatedBy: 'system'
      }
    });

    // 2. PDF Report
    const pdfResult = await this.generatePDFReport(config);
    artifacts.pdf = pdfResult;
    totalSizeMB += pdfResult.sizeMB;
    artifactSummaries.push({
      key: 'pdf',
      title: `${config.projectName || 'Analysis'} Report`,
      format: 'pdf',
      filename: pdfResult.filename,
      url: pdfResult.url,
      sizeMB: pdfResult.sizeMB,
      metadata: {
        stepId: 'analysis_execution',
        generatedBy: 'system'
      }
    });

    // Track in billing
    await billingService.trackFeatureUsage(userId, 'pdf_report', this.detectComplexity(visualizations.length, insights.length), pdfResult.sizeMB);
    totalCost += await this.calculateArtifactCost(userId, 'pdf_report', pdfResult.sizeMB);

    // 3. Presentation
    const pptxResult = await this.generatePresentation(config);
    artifacts.presentation = pptxResult;
    totalSizeMB += pptxResult.sizeMB;
    artifactSummaries.push({
      key: 'presentation',
      title: `${config.projectName || 'Analysis'} Presentation`,
      format: 'pptx',
      filename: pptxResult.filename,
      url: pptxResult.url,
      sizeMB: pptxResult.sizeMB,
      metadata: {
        stepId: 'analysis_execution',
        generatedBy: 'system'
      }
    });

    await billingService.trackFeatureUsage(userId, 'presentation', this.detectComplexity(visualizations.length, insights.length), pptxResult.sizeMB);
    totalCost += await this.calculateArtifactCost(userId, 'presentation', pptxResult.sizeMB);

    // 4. CSV Export
    const csvResult = await this.generateCSVData(config);
    artifacts.csv = csvResult;
    totalSizeMB += csvResult.sizeMB;
    artifactSummaries.push({
      key: 'csv',
      title: `${config.projectName || 'Analysis'} Data Export`,
      format: 'csv',
      filename: csvResult.filename,
      url: csvResult.url,
      sizeMB: csvResult.sizeMB,
      metadata: {
        stepId: 'analysis_execution',
        generatedBy: 'system'
      }
    });

    await billingService.trackFeatureUsage(userId, 'csv_export', 'small', csvResult.sizeMB);
    totalCost += await this.calculateArtifactCost(userId, 'csv_export', csvResult.sizeMB);

    // 5. JSON (only for business/technical/consultation)
    if (journeyType !== 'non-tech') {
      const jsonResult = await this.generateJSONData(config);
      artifacts.json = jsonResult;
      totalSizeMB += jsonResult.sizeMB;
      artifactSummaries.push({
        key: 'json',
        title: `${config.projectName || 'Analysis'} Results JSON`,
        format: 'json',
        filename: jsonResult.filename,
        url: jsonResult.url,
        sizeMB: jsonResult.sizeMB,
        metadata: {
          stepId: 'analysis_execution',
          generatedBy: 'system'
        }
      });

      await billingService.trackFeatureUsage(userId, 'json_export', 'small', jsonResult.sizeMB);
      totalCost += await this.calculateArtifactCost(userId, 'json_export', jsonResult.sizeMB);
    }

    console.log(`💰 Total artifact cost for user ${userId}: $${totalCost / 100}`);

    // ✅ SAVE ARTIFACTS TO DATABASE
    try {
      const fileRefs = [];

      if (artifacts.pdf) fileRefs.push({
        type: 'pdf',
        url: artifacts.pdf.url,
        filename: artifacts.pdf.filename,
        sizeMB: artifacts.pdf.sizeMB
      });
      if (artifacts.presentation) fileRefs.push({
        type: 'presentation',
        url: artifacts.presentation.url,
        filename: artifacts.presentation.filename,
        sizeMB: artifacts.presentation.sizeMB
      });
      if (artifacts.csv) fileRefs.push({
        type: 'csv',
        url: artifacts.csv.url,
        filename: artifacts.csv.filename,
        sizeMB: artifacts.csv.sizeMB
      });
      if (artifacts.json) fileRefs.push({
        type: 'json',
        url: artifacts.json.url,
        filename: artifacts.json.filename,
        sizeMB: artifacts.json.sizeMB
      });
      if (artifacts.dashboard) fileRefs.push({
        type: 'dashboard',
        url: artifacts.dashboard.url
      });

      await db.insert(projectArtifacts).values({
        id: nanoid(),
        projectId,
        type: 'analysis',
        status: 'completed',
        fileRefs: JSON.stringify(fileRefs),
        metrics: JSON.stringify({
          totalSizeMB,
          totalCost,
          artifactCount: Object.keys(artifacts).length,
          journeyType
        }),
        output: JSON.stringify(artifacts),
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      console.log(`✅ Saved artifact metadata to database for project ${projectId}`);
    } catch (dbError) {
      console.error('❌ Failed to save artifact metadata to database:', dbError);
      // Don't fail the whole operation if DB save fails
    }

    // ✅ Persist generated artifacts in workflow catalog for transparency dashboard
    try {
      const now = new Date();
      for (const summary of artifactSummaries) {
        await db.insert(generatedArtifacts).values({
          id: nanoid(),
          projectId,
          type: summary.key === 'dashboard' ? 'dashboard' : 'analysis_output',
          title: summary.title,
          format: summary.format,
          content: JSON.stringify({
            downloadUrl: summary.url,
            filename: summary.filename,
            sizeMB: summary.sizeMB,
            metadata: summary.metadata
          }),
          components: JSON.stringify([]),
          metadata: JSON.stringify({
            ...(summary.metadata || {}),
            artifactKey: summary.key,
            journeyType,
            totalSizeMB,
            totalCost
          }),
          status: 'generated',
          stepsCompleted: 1,
          totalDecisions: 0,
          totalArtifacts: artifactSummaries.length,
          completionTime: now,
          createdAt: now,
          updatedAt: now
        });
      }
    } catch (workflowDbError) {
      console.error('❌ Failed to record generated artifacts for workflow transparency:', workflowDbError);
    }

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
    const artifactDir = this.getArtifactDirectory(config);
    const outputPath = path.join(artifactDir, filename);

    fs.mkdirSync(artifactDir, { recursive: true });

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
      url: `/api/artifacts/${config.projectId}/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private async generatePresentation(config: ArtifactConfig) {
    const filename = `${config.projectId}-presentation.pptx`;
    const artifactDir = this.getArtifactDirectory(config);
    
    // TODO: Use pptxgenjs library for real PPTX generation
    // For now, create placeholder file
    fs.mkdirSync(artifactDir, { recursive: true });
    const outputPath = path.join(artifactDir, filename);
    fs.writeFileSync(outputPath, 'Placeholder PPTX file - real generation pending');
    
    return {
      url: `/api/artifacts/${config.projectId}/${filename}`,
      filename,
      sizeMB: 0.5 // Estimated
    };
  }

  private async generateCSVData(config: ArtifactConfig) {
    const filename = `${config.projectId}-data.csv`;
    const artifactDir = this.getArtifactDirectory(config);
    const outputPath = path.join(artifactDir, filename);

    fs.mkdirSync(artifactDir, { recursive: true });

    const worksheet = XLSX.utils.json_to_sheet(config.analysisResults);
    const csv = XLSX.utils.sheet_to_csv(worksheet);

    fs.writeFileSync(outputPath, csv);

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);

    return {
      url: `/api/artifacts/${config.projectId}/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private async generateJSONData(config: ArtifactConfig) {
    const filename = `${config.projectId}-data.json`;
    const artifactDir = this.getArtifactDirectory(config);
    const outputPath = path.join(artifactDir, filename);

    fs.mkdirSync(artifactDir, { recursive: true });

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
      url: `/api/artifacts/${config.projectId}/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private detectFilters(data: any[]) {
    // Basic filter detection
    return [{ type: 'search', label: 'Search', column: '_all' }];
  }

  private detectComplexity(vizCount: number, insightCount: number): 'small' | 'medium' | 'large' | 'extra_large' {
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
