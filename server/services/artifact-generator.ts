import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../db';
import { projectArtifacts, generatedArtifacts } from '../../shared/schema';
import { nanoid } from 'nanoid';
// P0-8 FIX: Import pptxgenjs for real presentation generation
import * as PptxGenJSModule from 'pptxgenjs';
const PptxGenJS = (PptxGenJSModule as any).default || PptxGenJSModule;

export interface ArtifactConfig {
  projectId: string;
  projectName?: string; // Project name for folder structure
  userId: string;
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation';
  analysisResults: any[];
  visualizations: any[];
  insights: string[];
  datasetSizeMB: number;
  // ✅ GAP 7 FIX: PII configuration for artifact filtering
  piiConfig?: {
    excludedColumns: string[];
    anonymizationApplied: boolean;
    piiColumnsRemoved: string[];
  };
  // ✅ BUSINESS VALUE FIX: Comprehensive analysis output from DataScienceOrchestrator
  comprehensiveResults?: {
    dataQualityReport?: {
      overallScore: number;
      missingValueAnalysis?: any[];
      outlierDetection?: any[];
      distributionAssessments?: any[];
    };
    statisticalAnalysisReport?: {
      correlationMatrix?: Record<string, Record<string, number>>;
      significantCorrelations?: Array<{ var1: string; var2: string; correlation: number; pValue?: number }>;
      regressionResults?: any;
      hypothesisTests?: any[];
    };
    mlModels?: Array<{
      modelType: string;
      metrics: { accuracy?: number; r2?: number; rmse?: number; silhouetteScore?: number };
      featureImportance?: Array<{ feature: string; importance: number }>;
      predictions?: any[];
    }>;
    executiveSummary?: {
      keyFindings: string[];
      recommendations: Array<{ title: string; description: string; priority: string; impact?: string }>;
      answeredQuestions?: Array<{ question: string; answer: string; confidence: number; evidence?: string[] }>;
    };
    businessKPIs?: Array<{
      name: string;
      value: string | number;
      trend?: 'up' | 'down' | 'stable';
      benchmark?: string;
      insight?: string;
    }>;
    metadata?: {
      totalRows: number;
      totalColumns: number;
      analysisTypes: string[];
      executionTimeMs: number;
    };
  };
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

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let yPos = 20;

    // Helper function to add new page if needed
    const checkPageBreak = (requiredSpace: number = 30) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
    };

    // Helper to wrap text
    const addWrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize: number = 10) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, x, y);
      return lines.length * (fontSize * 0.4);
    };

    // ========== TITLE PAGE ==========
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Data Analysis Report', pageWidth / 2, 40, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(config.projectName || 'Analysis Project', pageWidth / 2, 55, { align: 'center' });

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 70, { align: 'center' });
    doc.text(`Journey Type: ${config.journeyType}`, pageWidth / 2, 80, { align: 'center' });

    const comp = config.comprehensiveResults;
    if (comp?.metadata) {
      doc.text(`Data: ${comp.metadata.totalRows?.toLocaleString() || 'N/A'} rows, ${comp.metadata.totalColumns || 'N/A'} columns`, pageWidth / 2, 90, { align: 'center' });
    }

    // ========== EXECUTIVE SUMMARY ==========
    doc.addPage();
    yPos = 20;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Executive Summary', margin, yPos);
    yPos += 15;

    // Data Quality Score
    if (comp?.dataQualityReport?.overallScore !== undefined) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Data Quality Score', margin, yPos);
      yPos += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const qualityScore = comp.dataQualityReport.overallScore;
      const qualityLabel = qualityScore >= 80 ? 'Excellent' : qualityScore >= 60 ? 'Good' : qualityScore >= 40 ? 'Fair' : 'Needs Attention';
      doc.text(`${qualityScore}/100 - ${qualityLabel}`, margin, yPos);
      yPos += 15;
    }

    // Key Findings
    if (comp?.executiveSummary?.keyFindings?.length || config.insights.length) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Key Findings', margin, yPos);
      yPos += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      const findings = comp?.executiveSummary?.keyFindings || config.insights;
      findings.slice(0, 5).forEach((finding, i) => {
        checkPageBreak();
        const height = addWrappedText(`${i + 1}. ${finding}`, margin, yPos, contentWidth, 10);
        yPos += height + 5;
      });
      yPos += 10;
    }

    // ========== BUSINESS KPIs (if available) ==========
    if (comp?.businessKPIs?.length) {
      checkPageBreak(50);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Key Performance Indicators', margin, yPos);
      yPos += 10;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      comp.businessKPIs.slice(0, 6).forEach((kpi) => {
        checkPageBreak();
        const trendIcon = kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→';
        doc.text(`• ${kpi.name}: ${kpi.value} ${trendIcon}`, margin, yPos);
        yPos += 6;
        if (kpi.insight) {
          const height = addWrappedText(`  ${kpi.insight}`, margin + 5, yPos, contentWidth - 10, 9);
          yPos += height + 3;
        }
      });
      yPos += 10;
    }

    // ========== STATISTICAL ANALYSIS ==========
    doc.addPage();
    yPos = 20;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Statistical Analysis', margin, yPos);
    yPos += 15;

    // Significant Correlations
    if (comp?.statisticalAnalysisReport?.significantCorrelations?.length) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Significant Correlations Found', margin, yPos);
      yPos += 10;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      comp.statisticalAnalysisReport.significantCorrelations.slice(0, 10).forEach((corr) => {
        checkPageBreak();
        const strength = Math.abs(corr.correlation) > 0.7 ? 'Strong' : Math.abs(corr.correlation) > 0.4 ? 'Moderate' : 'Weak';
        const direction = corr.correlation > 0 ? 'positive' : 'negative';
        doc.text(`• ${corr.var1} ↔ ${corr.var2}: ${corr.correlation.toFixed(3)} (${strength} ${direction})`, margin, yPos);
        yPos += 6;
        if (corr.pValue !== undefined) {
          doc.setFontSize(9);
          doc.text(`  p-value: ${corr.pValue < 0.001 ? '<0.001' : corr.pValue.toFixed(4)} ${corr.pValue < 0.05 ? '(statistically significant)' : ''}`, margin + 5, yPos);
          doc.setFontSize(10);
          yPos += 5;
        }
      });
      yPos += 10;
    }

    // Regression Results
    if (comp?.statisticalAnalysisReport?.regressionResults) {
      checkPageBreak(40);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Regression Analysis', margin, yPos);
      yPos += 10;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      const reg = comp.statisticalAnalysisReport.regressionResults;
      if (reg.r2 !== undefined) {
        doc.text(`R² Score: ${(reg.r2 * 100).toFixed(1)}% (variance explained)`, margin, yPos);
        yPos += 6;
      }
      if (reg.rmse !== undefined) {
        doc.text(`RMSE: ${reg.rmse.toFixed(4)} (prediction error)`, margin, yPos);
        yPos += 6;
      }
      yPos += 10;
    }

    // ========== MACHINE LEARNING MODELS ==========
    if (comp?.mlModels?.length) {
      checkPageBreak(50);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Machine Learning Analysis', margin, yPos);
      yPos += 15;

      comp.mlModels.forEach((model) => {
        checkPageBreak(40);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${model.modelType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`, margin, yPos);
        yPos += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        // Model metrics
        if (model.metrics.accuracy !== undefined) {
          doc.text(`Accuracy: ${(model.metrics.accuracy * 100).toFixed(1)}%`, margin, yPos);
          yPos += 6;
        }
        if (model.metrics.r2 !== undefined) {
          doc.text(`R² Score: ${(model.metrics.r2 * 100).toFixed(1)}%`, margin, yPos);
          yPos += 6;
        }
        if (model.metrics.silhouetteScore !== undefined) {
          doc.text(`Silhouette Score: ${model.metrics.silhouetteScore.toFixed(3)}`, margin, yPos);
          yPos += 6;
        }

        // Feature importance
        if (model.featureImportance?.length) {
          yPos += 3;
          doc.text('Top Features:', margin, yPos);
          yPos += 6;
          model.featureImportance.slice(0, 5).forEach((fi, i) => {
            doc.text(`  ${i + 1}. ${fi.feature}: ${(fi.importance * 100).toFixed(1)}%`, margin, yPos);
            yPos += 5;
          });
        }
        yPos += 10;
      });
    }

    // ========== RECOMMENDATIONS ==========
    if (comp?.executiveSummary?.recommendations?.length) {
      doc.addPage();
      yPos = 20;

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Recommendations', margin, yPos);
      yPos += 15;

      comp.executiveSummary.recommendations.forEach((rec, i) => {
        checkPageBreak(30);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`${i + 1}. ${rec.title}`, margin, yPos);
        yPos += 7;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        const priorityColor = rec.priority === 'high' || rec.priority === 'immediate' ? '!' :
                             rec.priority === 'medium' ? '•' : '○';
        doc.text(`Priority: ${priorityColor} ${rec.priority}`, margin, yPos);
        yPos += 6;

        if (rec.impact) {
          doc.text(`Impact: ${rec.impact}`, margin, yPos);
          yPos += 6;
        }

        const height = addWrappedText(rec.description, margin, yPos, contentWidth, 10);
        yPos += height + 10;
      });
    }

    // ========== ANSWERED QUESTIONS ==========
    if (comp?.executiveSummary?.answeredQuestions?.length) {
      checkPageBreak(50);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Questions Answered by Analysis', margin, yPos);
      yPos += 12;

      comp.executiveSummary.answeredQuestions.forEach((qa, i) => {
        checkPageBreak(35);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const qHeight = addWrappedText(`Q${i + 1}: ${qa.question}`, margin, yPos, contentWidth, 10);
        yPos += qHeight + 3;

        doc.setFont('helvetica', 'normal');
        const aHeight = addWrappedText(`A: ${qa.answer}`, margin, yPos, contentWidth, 10);
        yPos += aHeight + 2;

        doc.setFontSize(9);
        doc.text(`Confidence: ${(qa.confidence * 100).toFixed(0)}%`, margin, yPos);
        yPos += 10;
      });
    }

    // ========== DATA QUALITY DETAILS ==========
    if (comp?.dataQualityReport) {
      doc.addPage();
      yPos = 20;

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Data Quality Assessment', margin, yPos);
      yPos += 15;

      // Missing values
      if (comp.dataQualityReport.missingValueAnalysis?.length) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Missing Values by Column', margin, yPos);
        yPos += 10;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        const columnsWithMissing = comp.dataQualityReport.missingValueAnalysis
          .filter((mv: any) => mv.missingPercent > 0)
          .slice(0, 10);

        if (columnsWithMissing.length === 0) {
          doc.text('No missing values detected in the dataset.', margin, yPos);
          yPos += 6;
        } else {
          columnsWithMissing.forEach((mv: any) => {
            checkPageBreak();
            doc.text(`• ${mv.column}: ${mv.missingPercent?.toFixed(1) || 0}% missing`, margin, yPos);
            yPos += 6;
          });
        }
        yPos += 10;
      }

      // Outliers
      if (comp.dataQualityReport.outlierDetection?.length) {
        checkPageBreak(30);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Outlier Detection', margin, yPos);
        yPos += 10;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        const columnsWithOutliers = comp.dataQualityReport.outlierDetection
          .filter((od: any) => od.outlierCount > 0)
          .slice(0, 10);

        if (columnsWithOutliers.length === 0) {
          doc.text('No significant outliers detected.', margin, yPos);
          yPos += 6;
        } else {
          columnsWithOutliers.forEach((od: any) => {
            checkPageBreak();
            doc.text(`• ${od.column}: ${od.outlierCount} outliers (${od.outlierPercent?.toFixed(1) || 0}%)`, margin, yPos);
            yPos += 6;
          });
        }
      }
    }

    // ========== FOOTER ON ALL PAGES ==========
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, 290, { align: 'center' });
      doc.text('Generated by ChimariData Analytics Platform', margin, 290);
    }

    doc.save(outputPath);

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);

    console.log(`📄 [PDF] Generated comprehensive report: ${outputPath} (${sizeMB.toFixed(2)} MB)`);

    return {
      url: `/api/artifacts/${config.projectId}/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  /**
   * P0-8 FIX: Generate real PPTX presentation using pptxgenjs
   * Creates professional slides with analysis results, KPIs, and recommendations
   */
  private async generatePresentation(config: ArtifactConfig) {
    const filename = `${config.projectId}-presentation.pptx`;
    const artifactDir = this.getArtifactDirectory(config);
    const outputPath = path.join(artifactDir, filename);

    fs.mkdirSync(artifactDir, { recursive: true });

    const pptx = new PptxGenJS();
    pptx.author = 'ChimariData Analytics';
    pptx.title = `${config.projectName || 'Data Analysis'} Report`;
    pptx.subject = 'Automated Analytics Presentation';
    pptx.company = 'ChimariData';

    // Theme colors
    const primaryColor = '2563EB'; // Blue
    const secondaryColor = '10B981'; // Green
    const accentColor = 'F59E0B'; // Amber
    const textColor = '1F2937'; // Dark gray
    const lightBg = 'F3F4F6'; // Light gray background

    const comp = config.comprehensiveResults;

    // ========== SLIDE 1: TITLE ==========
    const titleSlide = pptx.addSlide();
    titleSlide.addText('Data Analysis Report', {
      x: 0.5,
      y: 2.0,
      w: 9,
      h: 1.2,
      fontSize: 44,
      bold: true,
      color: primaryColor,
      align: 'center'
    });
    titleSlide.addText(config.projectName || 'Analysis Project', {
      x: 0.5,
      y: 3.3,
      w: 9,
      h: 0.6,
      fontSize: 24,
      color: textColor,
      align: 'center'
    });
    titleSlide.addText(`Generated: ${new Date().toLocaleDateString()}`, {
      x: 0.5,
      y: 4.0,
      w: 9,
      h: 0.4,
      fontSize: 14,
      color: '6B7280',
      align: 'center'
    });
    if (comp?.metadata) {
      titleSlide.addText(`${comp.metadata.totalRows?.toLocaleString() || 'N/A'} rows | ${comp.metadata.totalColumns || 'N/A'} columns`, {
        x: 0.5,
        y: 4.5,
        w: 9,
        h: 0.4,
        fontSize: 12,
        color: '9CA3AF',
        align: 'center'
      });
    }
    titleSlide.addText('ChimariData Analytics Platform', {
      x: 0.5,
      y: 5.0,
      w: 9,
      h: 0.3,
      fontSize: 10,
      color: primaryColor,
      align: 'center'
    });

    // ========== SLIDE 2: EXECUTIVE SUMMARY ==========
    const summarySlide = pptx.addSlide();
    summarySlide.addText('Executive Summary', {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.6,
      fontSize: 28,
      bold: true,
      color: primaryColor
    });

    let yPos = 1.0;

    // Data Quality Score
    if (comp?.dataQualityReport?.overallScore !== undefined) {
      const score = comp.dataQualityReport.overallScore;
      const scoreColor = score >= 80 ? secondaryColor : score >= 60 ? accentColor : 'EF4444';
      const qualityLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Attention';

      summarySlide.addText('Data Quality Score', {
        x: 0.5,
        y: yPos,
        w: 3,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: textColor
      });
      summarySlide.addShape('rect', {
        x: 3.5,
        y: yPos,
        w: 1.2,
        h: 0.4,
        fill: { color: scoreColor },
        line: { color: scoreColor }
      });
      summarySlide.addText(`${score}/100`, {
        x: 3.5,
        y: yPos,
        w: 1.2,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: 'FFFFFF',
        align: 'center',
        valign: 'middle'
      });
      summarySlide.addText(qualityLabel, {
        x: 4.8,
        y: yPos,
        w: 2,
        h: 0.4,
        fontSize: 12,
        color: scoreColor
      });
      yPos += 0.6;
    }

    // Key Findings
    const findings = comp?.executiveSummary?.keyFindings || config.insights;
    if (findings?.length) {
      summarySlide.addText('Key Findings', {
        x: 0.5,
        y: yPos,
        w: 9,
        h: 0.4,
        fontSize: 16,
        bold: true,
        color: textColor
      });
      yPos += 0.5;

      findings.slice(0, 4).forEach((finding: string, i: number) => {
        summarySlide.addText(`${i + 1}. ${finding}`, {
          x: 0.7,
          y: yPos,
          w: 8.5,
          h: 0.5,
          fontSize: 11,
          color: textColor,
          valign: 'top'
        });
        yPos += 0.55;
      });
    }

    // ========== SLIDE 3: BUSINESS KPIs (if available) ==========
    if (comp?.businessKPIs?.length) {
      const kpiSlide = pptx.addSlide();
      kpiSlide.addText('Key Performance Indicators', {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.6,
        fontSize: 28,
        bold: true,
        color: primaryColor
      });

      // Create KPI cards in a 2x3 grid
      const kpis = comp.businessKPIs.slice(0, 6);
      kpis.forEach((kpi, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 0.5 + (col * 3.1);
        const y = 1.2 + (row * 2.2);

        // KPI Card background
        kpiSlide.addShape('rect', {
          x,
          y,
          w: 2.9,
          h: 2.0,
          fill: { color: lightBg },
          line: { color: 'E5E7EB', pt: 1 }
        });

        // KPI Name
        kpiSlide.addText(kpi.name, {
          x,
          y: y + 0.15,
          w: 2.9,
          h: 0.4,
          fontSize: 11,
          bold: true,
          color: textColor,
          align: 'center'
        });

        // KPI Value
        const trendIcon = kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→';
        const trendColor = kpi.trend === 'up' ? secondaryColor : kpi.trend === 'down' ? 'EF4444' : '6B7280';
        kpiSlide.addText(`${kpi.value}`, {
          x,
          y: y + 0.6,
          w: 2.4,
          h: 0.5,
          fontSize: 24,
          bold: true,
          color: primaryColor,
          align: 'center'
        });
        kpiSlide.addText(trendIcon, {
          x: x + 2.1,
          y: y + 0.6,
          w: 0.5,
          h: 0.5,
          fontSize: 20,
          bold: true,
          color: trendColor,
          align: 'center'
        });

        // KPI Insight
        if (kpi.insight) {
          kpiSlide.addText(kpi.insight.substring(0, 80) + (kpi.insight.length > 80 ? '...' : ''), {
            x: x + 0.1,
            y: y + 1.2,
            w: 2.7,
            h: 0.7,
            fontSize: 9,
            color: '6B7280',
            align: 'center',
            valign: 'top'
          });
        }
      });
    }

    // ========== SLIDE 4: STATISTICAL INSIGHTS ==========
    if (comp?.statisticalAnalysisReport?.significantCorrelations?.length || comp?.statisticalAnalysisReport?.regressionResults) {
      const statsSlide = pptx.addSlide();
      statsSlide.addText('Statistical Analysis', {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.6,
        fontSize: 28,
        bold: true,
        color: primaryColor
      });

      let statsY = 1.0;

      // Correlations
      if (comp.statisticalAnalysisReport.significantCorrelations?.length) {
        statsSlide.addText('Significant Correlations', {
          x: 0.5,
          y: statsY,
          w: 4,
          h: 0.4,
          fontSize: 16,
          bold: true,
          color: textColor
        });
        statsY += 0.5;

        const correlations = comp.statisticalAnalysisReport.significantCorrelations.slice(0, 5);
        correlations.forEach((corr) => {
          const strength = Math.abs(corr.correlation) > 0.7 ? 'Strong' : Math.abs(corr.correlation) > 0.4 ? 'Moderate' : 'Weak';
          const direction = corr.correlation > 0 ? '+' : '-';
          statsSlide.addText(`${corr.var1} ↔ ${corr.var2}: ${direction}${Math.abs(corr.correlation).toFixed(2)} (${strength})`, {
            x: 0.7,
            y: statsY,
            w: 8,
            h: 0.35,
            fontSize: 10,
            color: textColor
          });
          statsY += 0.4;
        });
        statsY += 0.3;
      }

      // Regression
      if (comp.statisticalAnalysisReport.regressionResults) {
        const reg = comp.statisticalAnalysisReport.regressionResults;
        statsSlide.addText('Regression Analysis', {
          x: 0.5,
          y: statsY,
          w: 4,
          h: 0.4,
          fontSize: 16,
          bold: true,
          color: textColor
        });
        statsY += 0.5;

        if (reg.r2 !== undefined) {
          statsSlide.addText(`R² Score: ${(reg.r2 * 100).toFixed(1)}% variance explained`, {
            x: 0.7,
            y: statsY,
            w: 8,
            h: 0.35,
            fontSize: 11,
            color: textColor
          });
          statsY += 0.4;
        }
        if (reg.rmse !== undefined) {
          statsSlide.addText(`RMSE: ${reg.rmse.toFixed(4)} prediction error`, {
            x: 0.7,
            y: statsY,
            w: 8,
            h: 0.35,
            fontSize: 11,
            color: textColor
          });
        }
      }
    }

    // ========== SLIDE 5: ML MODELS (if available) ==========
    if (comp?.mlModels?.length) {
      const mlSlide = pptx.addSlide();
      mlSlide.addText('Machine Learning Analysis', {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.6,
        fontSize: 28,
        bold: true,
        color: primaryColor
      });

      let mlY = 1.0;
      comp.mlModels.slice(0, 3).forEach((model) => {
        // Model name
        mlSlide.addText(model.modelType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), {
          x: 0.5,
          y: mlY,
          w: 9,
          h: 0.4,
          fontSize: 14,
          bold: true,
          color: textColor
        });
        mlY += 0.45;

        // Metrics
        const metricsText: string[] = [];
        if (model.metrics.accuracy !== undefined) metricsText.push(`Accuracy: ${(model.metrics.accuracy * 100).toFixed(1)}%`);
        if (model.metrics.r2 !== undefined) metricsText.push(`R²: ${(model.metrics.r2 * 100).toFixed(1)}%`);
        if (model.metrics.silhouetteScore !== undefined) metricsText.push(`Silhouette: ${model.metrics.silhouetteScore.toFixed(3)}`);

        mlSlide.addText(metricsText.join(' | '), {
          x: 0.7,
          y: mlY,
          w: 8,
          h: 0.35,
          fontSize: 11,
          color: secondaryColor
        });
        mlY += 0.4;

        // Feature importance
        if (model.featureImportance?.length) {
          const topFeatures = model.featureImportance.slice(0, 3)
            .map(fi => `${fi.feature} (${(fi.importance * 100).toFixed(0)}%)`)
            .join(', ');
          mlSlide.addText(`Top features: ${topFeatures}`, {
            x: 0.7,
            y: mlY,
            w: 8,
            h: 0.35,
            fontSize: 10,
            color: '6B7280'
          });
          mlY += 0.4;
        }
        mlY += 0.3;
      });
    }

    // ========== SLIDE 6: RECOMMENDATIONS ==========
    if (comp?.executiveSummary?.recommendations?.length) {
      const recSlide = pptx.addSlide();
      recSlide.addText('Recommendations', {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.6,
        fontSize: 28,
        bold: true,
        color: primaryColor
      });

      let recY = 1.0;
      comp.executiveSummary.recommendations.slice(0, 4).forEach((rec, i) => {
        // Priority badge
        const priorityColor = rec.priority === 'high' || rec.priority === 'immediate' ? 'EF4444' :
                             rec.priority === 'medium' ? accentColor : secondaryColor;

        recSlide.addShape('rect', {
          x: 0.5,
          y: recY,
          w: 0.8,
          h: 0.3,
          fill: { color: priorityColor },
          line: { color: priorityColor }
        });
        recSlide.addText(rec.priority.toUpperCase(), {
          x: 0.5,
          y: recY,
          w: 0.8,
          h: 0.3,
          fontSize: 8,
          bold: true,
          color: 'FFFFFF',
          align: 'center',
          valign: 'middle'
        });

        // Title
        recSlide.addText(`${i + 1}. ${rec.title}`, {
          x: 1.4,
          y: recY,
          w: 8,
          h: 0.35,
          fontSize: 12,
          bold: true,
          color: textColor
        });
        recY += 0.4;

        // Description
        recSlide.addText(rec.description.substring(0, 150) + (rec.description.length > 150 ? '...' : ''), {
          x: 1.4,
          y: recY,
          w: 8,
          h: 0.6,
          fontSize: 10,
          color: '6B7280',
          valign: 'top'
        });
        recY += 0.8;
      });
    }

    // ========== SLIDE 7: Q&A (if available) ==========
    if (comp?.executiveSummary?.answeredQuestions?.length) {
      const qaSlide = pptx.addSlide();
      qaSlide.addText('Questions Answered', {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.6,
        fontSize: 28,
        bold: true,
        color: primaryColor
      });

      let qaY = 1.0;
      comp.executiveSummary.answeredQuestions.slice(0, 3).forEach((qa, i) => {
        // Question
        qaSlide.addText(`Q${i + 1}: ${qa.question}`, {
          x: 0.5,
          y: qaY,
          w: 9,
          h: 0.4,
          fontSize: 11,
          bold: true,
          color: textColor
        });
        qaY += 0.45;

        // Answer
        qaSlide.addText(`A: ${qa.answer.substring(0, 200)}${qa.answer.length > 200 ? '...' : ''}`, {
          x: 0.5,
          y: qaY,
          w: 9,
          h: 0.7,
          fontSize: 10,
          color: '4B5563',
          valign: 'top'
        });
        qaY += 0.8;

        // Confidence
        const confidenceColor = qa.confidence >= 0.8 ? secondaryColor : qa.confidence >= 0.6 ? accentColor : '6B7280';
        qaSlide.addText(`Confidence: ${(qa.confidence * 100).toFixed(0)}%`, {
          x: 0.5,
          y: qaY,
          w: 2,
          h: 0.3,
          fontSize: 9,
          color: confidenceColor
        });
        qaY += 0.5;
      });
    }

    // ========== SLIDE 8: THANK YOU ==========
    const endSlide = pptx.addSlide();
    endSlide.addText('Thank You', {
      x: 0.5,
      y: 2.0,
      w: 9,
      h: 0.8,
      fontSize: 40,
      bold: true,
      color: primaryColor,
      align: 'center'
    });
    endSlide.addText('Analysis powered by ChimariData', {
      x: 0.5,
      y: 3.0,
      w: 9,
      h: 0.5,
      fontSize: 16,
      color: textColor,
      align: 'center'
    });
    endSlide.addText(`Report generated on ${new Date().toLocaleDateString()}`, {
      x: 0.5,
      y: 3.6,
      w: 9,
      h: 0.4,
      fontSize: 12,
      color: '9CA3AF',
      align: 'center'
    });

    // Write the file
    await pptx.writeFile({ fileName: outputPath });

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);

    console.log(`📊 [PPTX] Generated presentation: ${outputPath} (${sizeMB.toFixed(2)} MB)`);

    return {
      url: `/api/artifacts/${config.projectId}/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private async generateCSVData(config: ArtifactConfig) {
    const filename = `${config.projectId}-data.csv`;
    const artifactDir = this.getArtifactDirectory(config);
    const outputPath = path.join(artifactDir, filename);

    fs.mkdirSync(artifactDir, { recursive: true });

    // ✅ GAP 7 FIX: Filter out PII columns from CSV export
    let dataToExport = config.analysisResults;
    if (config.piiConfig && config.piiConfig.excludedColumns.length > 0) {
      const excludedCols = new Set(config.piiConfig.excludedColumns.map(c => c.toLowerCase()));
      console.log(`🔒 [GAP 7 FIX] Filtering ${excludedCols.size} PII columns from CSV export`);

      dataToExport = config.analysisResults.map((row: any) => {
        const filteredRow: Record<string, any> = {};
        for (const key of Object.keys(row)) {
          if (!excludedCols.has(key.toLowerCase())) {
            filteredRow[key] = row[key];
          }
        }
        return filteredRow;
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
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

    // ✅ P0-4: Filter out PII columns from JSON export
    let dataToExport = config.analysisResults;
    if (config.piiConfig && config.piiConfig.excludedColumns.length > 0) {
      const excludedCols = new Set(config.piiConfig.excludedColumns.map(c => c.toLowerCase()));
      console.log(`🔒 [P0-4] Filtering ${excludedCols.size} PII columns from JSON export`);

      dataToExport = config.analysisResults.map((row: any) => {
        const filteredRow: Record<string, any> = {};
        for (const key of Object.keys(row)) {
          if (!excludedCols.has(key.toLowerCase())) {
            filteredRow[key] = row[key];
          }
        }
        return filteredRow;
      });
    }

    const jsonData = {
      projectId: config.projectId,
      timestamp: new Date().toISOString(),
      results: dataToExport, // Use filtered data instead of raw analysisResults
      metadata: {
        engine: 'python-spark-hybrid',
        // P0-4: Include PII filtering info in metadata
        piiColumnsRemoved: config.piiConfig?.excludedColumns || [],
        anonymizationApplied: config.piiConfig?.anonymizationApplied || false
      }
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

// RealtimeServer integration for artifact completion notifications
let realtimeServer: any = null;

/**
 * Set the RealtimeServer instance for artifact completion notifications
 */
export function setRealtimeServer(server: any): void {
  realtimeServer = server;
  console.log('✅ ArtifactGenerator: RealtimeServer connected for completion notifications');
}

/**
 * Get the RealtimeServer instance
 */
export function getRealtimeServer(): any {
  return realtimeServer;
}

/**
 * Notify clients when artifact generation is complete
 */
export function notifyArtifactComplete(projectId: string, artifactType: string, url: string): void {
  if (realtimeServer) {
    try {
      realtimeServer.broadcastToProject(projectId, {
        type: 'artifact_complete',
        artifactType,
        url,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.warn('Failed to broadcast artifact completion:', error);
    }
  }
}
