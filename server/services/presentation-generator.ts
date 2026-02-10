/**
 * Presentation Generator Service
 *
 * Generates audience-specific PowerPoint presentations from analysis results.
 * Supports user-uploaded templates and merges them with generated content.
 *
 * Dependencies:
 * - pptx-automizer: Template-based presentation generation
 * - pptxgenjs: Fallback for code-based slide generation
 *
 * @module PresentationGenerator
 */

import * as AutomizerModule from 'pptx-automizer';
import type _Automizer from 'pptx-automizer';
const Automizer: typeof _Automizer = (AutomizerModule as any).default || AutomizerModule;
type Automizer = _Automizer;
import * as PptxGenJSModule from 'pptxgenjs';
import type _PptxGenJS from 'pptxgenjs';
const PptxGenJS: typeof _PptxGenJS = (PptxGenJSModule as any).default || PptxGenJSModule;
type PptxGenJS = InstanceType<typeof _PptxGenJS>;
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import { storage } from '../storage';

export interface PresentationContent {
  // Project context
  projectId: string;
  projectName: string;
  userId: string;

  // Analysis results
  executiveSummary?: string;
  keyInsights?: string[];
  recommendations?: string[];
  methodology?: string;

  // Data artifacts
  visualizations?: VisualizationSlide[];
  dataTables?: DataTableSlide[];
  kpiMetrics?: KPIMetric[];

  // Model diagnostics (technical)
  modelDiagnostics?: ModelDiagnostics;
  featureImportance?: FeatureImportance[];

  // Metadata
  generatedDate: Date;
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation' | 'custom';
}

export interface VisualizationSlide {
  title: string;
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'combo';
  data: any; // Chart data in format compatible with pptxgenjs
  description?: string;
  imageBuffer?: Buffer; // Pre-rendered chart as image
  imagePath?: string; // Path to saved chart image
}

export interface DataTableSlide {
  title: string;
  headers: string[];
  rows: any[][];
  description?: string;
}

export interface KPIMetric {
  label: string;
  value: string | number;
  change?: number; // Percentage change
  trend?: 'up' | 'down' | 'stable';
  description?: string;
}

export interface ModelDiagnostics {
  modelType: string;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  rmse?: number;
  r2Score?: number;
  confusionMatrix?: number[][];
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  rank: number;
}

export interface PresentationOptions {
  // Template selection
  userTemplateId?: string; // User-uploaded template
  defaultTemplate?: 'executive' | 'technical' | 'business' | 'consultation';
  templateName?: string;

  // Audience targeting
  audience: 'non-tech' | 'business' | 'technical' | 'consultation';
  communicationStyle: 'plain-language' | 'executive' | 'technical' | 'consultation';

  // Content filtering
  includeMethodology?: boolean;
  includeRawData?: boolean;
  includeTechnicalDetails?: boolean;
  includeModelDiagnostics?: boolean;

  // Branding
  companyName?: string;
  logoPath?: string;
  brandColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };

  // Output
  outputFilename?: string;
}

export interface PresentationResult {
  success: boolean;
  artifactId?: string;
  filePath?: string;
  buffer?: Buffer;
  slideCount?: number;
  error?: string;
  metadata?: {
    generatedAt: Date;
    template: string;
    audience: string;
    slideCount: number;
  };
}

export class PresentationGenerator {
  private templateDir: string;
  private outputDir: string;
  private defaultTemplatesDir: string;

  constructor() {
    this.templateDir = path.join(process.cwd(), 'uploads', 'templates', 'presentations');
    this.outputDir = path.join(process.cwd(), 'uploads', 'artifacts', 'presentations');
    this.defaultTemplatesDir = path.join(process.cwd(), 'templates', 'presentations');
  }

  /**
   * Generate an audience-specific presentation from analysis results
   */
  async generatePresentation(
    content: PresentationContent,
    options: PresentationOptions
  ): Promise<PresentationResult> {
    try {
      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });

      // Determine which template to use
      const templatePath = await this.resolveTemplate(content.userId, options);

      if (templatePath) {
        // Use pptx-automizer for template-based generation
        return await this.generateFromTemplate(content, options, templatePath);
      } else {
        // Fallback to code-based generation with PptxGenJS
        return await this.generateFromCode(content, options);
      }
    } catch (error: any) {
      console.error('Presentation generation failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate presentation'
      };
    }
  }

  /**
   * Resolve which template file to use based on user preferences and availability
   */
  private async resolveTemplate(
    userId: string,
    options: PresentationOptions
  ): Promise<string | null> {
    // Check for user-uploaded template
    if (options.userTemplateId) {
      const userTemplatePath = path.join(
        this.templateDir,
        userId,
        `${options.userTemplateId}.pptx`
      );

      try {
        await fs.access(userTemplatePath);
        return userTemplatePath;
      } catch {
        console.warn(`User template not found: ${userTemplatePath}`);
      }
    }

    // Check for default audience-specific template
    if (options.defaultTemplate) {
      const defaultPath = path.join(
        this.defaultTemplatesDir,
        `${options.defaultTemplate}.pptx`
      );

      try {
        await fs.access(defaultPath);
        return defaultPath;
      } catch {
        console.warn(`Default template not found: ${defaultPath}`);
      }
    }

    // No template available, will use code generation
    return null;
  }

  /**
   * Generate presentation using user/default template with pptx-automizer
   */
  private async generateFromTemplate(
    content: PresentationContent,
    options: PresentationOptions,
    templatePath: string
  ): Promise<PresentationResult> {
    const automizer = new Automizer({
      templateDir: path.dirname(templatePath),
      outputDir: this.outputDir,
      removeExistingSlides: false, // Keep template slides
    });

    const outputFilename = options.outputFilename ||
      `${content.projectName}_${Date.now()}.pptx`;

    // Load root template
    let pres = automizer.loadRoot(path.basename(templatePath));

    // Add audience-specific content slides based on options
    pres = await this.addAudienceSpecificSlides(pres, content, options, automizer);

    // Modify placeholders with actual data
    await this.populatePlaceholders(pres, content, options);

    // Write presentation to file
    await pres.write(outputFilename);

    const filePath = path.join(this.outputDir, outputFilename);

    // Read buffer for storage
    const buffer = await fs.readFile(filePath);

    const generatedAt = new Date();

    // Create artifact in database
    const artifact = await storage.createArtifact({
      id: nanoid(),
      projectId: content.projectId,
      type: 'presentation',
      status: 'completed',
      createdBy: content.userId,
      fileRefs: [{
        path: filePath,
        filename: outputFilename,
        template: path.basename(templatePath)
      }],
      output: {
        audience: options.audience,
        template: path.basename(templatePath),
        generatedAt: generatedAt.toISOString()
      }
    });

    return {
      success: true,
      artifactId: artifact.id,
      filePath,
      buffer,
      metadata: {
        generatedAt,
        template: path.basename(templatePath),
        audience: options.audience,
        slideCount: 0, // TODO: Extract from pres
      }
    };
  }

  /**
   * Generate presentation from code using PptxGenJS (no template)
   */
  private async generateFromCode(
    content: PresentationContent,
    options: PresentationOptions
  ): Promise<PresentationResult> {
    const pres = new PptxGenJS();

    // Define slide master based on audience
    this.defineAudienceMaster(pres, options);

    // Add title slide
    this.addTitleSlide(pres, content, options);

    // Add content based on audience
    if (options.audience === 'non-tech') {
      this.addNonTechSlides(pres, content);
    } else if (options.audience === 'business') {
      this.addBusinessSlides(pres, content);
    } else if (options.audience === 'technical') {
      this.addTechnicalSlides(pres, content, options);
    } else if (options.audience === 'consultation') {
      this.addConsultationSlides(pres, content, options);
    }

    // Generate buffer
    const buffer = await pres.write({ outputType: 'nodebuffer' }) as Buffer;

    // Save to file
    const outputFilename = options.outputFilename ||
      `${content.projectName}_${Date.now()}.pptx`;
    const filePath = path.join(this.outputDir, outputFilename);
    await fs.writeFile(filePath, buffer);

    const generatedAt = new Date();
    const templateName = options.templateName || 'code-generated';
    const slideCount = this.getSlideCount(pres);

    // Create artifact
    const artifact = await storage.createArtifact({
      id: nanoid(),
      projectId: content.projectId,
      type: 'presentation',
      status: 'completed',
      createdBy: content.userId,
      fileRefs: [{
        path: filePath,
        filename: outputFilename,
        template: templateName
      }],
      output: {
        audience: options.audience,
        template: templateName,
        slideCount,
        generatedAt: generatedAt.toISOString()
      }
    });

    return {
      success: true,
      artifactId: artifact.id,
      filePath,
      buffer,
      slideCount,
      metadata: {
        generatedAt,
        template: templateName,
        audience: options.audience,
        slideCount,
      }
    };
  }

  /**
   * Add audience-specific content slides to template
   */
  private async addAudienceSpecificSlides(
    pres: any,
    content: PresentationContent,
    options: PresentationOptions,
    automizer: Automizer
  ): Promise<any> {
    // Load additional content templates based on audience
    const contentLibraryPath = path.join(this.defaultTemplatesDir, 'content-library');

    // Add executive summary slide for all audiences
    if (content.executiveSummary) {
      // TODO: Add slide from content library or create new slide
    }

    // Add visualizations
    if (content.visualizations && content.visualizations.length > 0) {
      // TODO: Add chart slides
    }

    // Add model diagnostics for technical audiences only
    if (options.includeTechnicalDetails && content.modelDiagnostics) {
      // TODO: Add technical slides
    }

    return pres;
  }

  /**
   * Populate template placeholders with actual data
   */
  private async populatePlaceholders(
    pres: any,
    content: PresentationContent,
    options: PresentationOptions
  ): Promise<void> {
    // TODO: Use pptx-automizer's modifyElement to replace placeholders
    // Example:
    // slide.modifyElement('ProjectName', { text: content.projectName });
    // slide.modifyElement('GeneratedDate', { text: content.generatedDate.toLocaleDateString() });
  }

  /**
   * Define slide master for audience
   */
  private defineAudienceMaster(pres: PptxGenJS, options: PresentationOptions): void {
    pres.defineSlideMaster({
      title: `${options.audience}-master`,
      background: { color: options.brandColors?.primary || 'FFFFFF' },
      objects: [
        {
          placeholder: {
            options: {
              name: 'title',
              type: 'title',
              x: 0.5,
              y: 0.5,
              w: 9,
              h: 1,
            }
          }
        },
        {
          placeholder: {
            options: {
              name: 'body',
              type: 'body',
              x: 0.5,
              y: 1.5,
              w: 9,
              h: 5,
            }
          }
        }
      ]
    });
  }

  private getSlideCount(pres: PptxGenJS): number {
    const internal = pres as unknown as { slides?: unknown[] };
    return Array.isArray(internal.slides) ? internal.slides.length : 0;
  }

  /**
   * Add title slide
   */
  private addTitleSlide(
    pres: PptxGenJS,
    content: PresentationContent,
    options: PresentationOptions
  ): void {
    const slide = pres.addSlide();

    slide.addText(content.projectName, {
      x: 1,
      y: 1,
      w: 8,
      h: 1,
      fontSize: 44,
      bold: true,
      color: '363636'
    });

    slide.addText(`Analysis Results - ${options.audience} Summary`, {
      x: 1,
      y: 2,
      w: 8,
      h: 0.5,
      fontSize: 24,
      color: '666666'
    });

    slide.addText(content.generatedDate.toLocaleDateString(), {
      x: 1,
      y: 6,
      w: 8,
      h: 0.3,
      fontSize: 14,
      color: '999999'
    });
  }

  /**
   * Add slides for non-technical audience
   */
  private addNonTechSlides(pres: PptxGenJS, content: PresentationContent): void {
    // Executive Summary
    if (content.executiveSummary) {
      const slide = pres.addSlide();
      slide.addText('Executive Summary', { x: 0.5, y: 0.5, fontSize: 32, bold: true });
      slide.addText(content.executiveSummary, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 4.5,
        fontSize: 18,
        valign: 'top'
      });
    }

    // Key Insights (bullet points)
    if (content.keyInsights && content.keyInsights.length > 0) {
      const slide = pres.addSlide();
      slide.addText('Key Insights', { x: 0.5, y: 0.5, fontSize: 32, bold: true });
      slide.addText(
        content.keyInsights.map(insight => `• ${insight}`).join('\n'),
        { x: 0.5, y: 1.5, w: 9, h: 4.5, fontSize: 18 }
      );
    }

    // Simple visualizations only
    this.addSimpleVisualizations(pres, content);
  }

  /**
   * Add slides for business audience
   */
  private addBusinessSlides(pres: PptxGenJS, content: PresentationContent): void {
    // Context + KPIs
    if (content.kpiMetrics && content.kpiMetrics.length > 0) {
      const slide = pres.addSlide();
      slide.addText('Key Performance Indicators', { x: 0.5, y: 0.5, fontSize: 32, bold: true });

      // TODO: Add KPI cards/metrics layout
    }

    // Recommendations
    if (content.recommendations && content.recommendations.length > 0) {
      const slide = pres.addSlide();
      slide.addText('Recommendations', { x: 0.5, y: 0.5, fontSize: 32, bold: true });
      slide.addText(
        content.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n\n'),
        { x: 0.5, y: 1.5, w: 9, h: 4.5, fontSize: 18 }
      );
    }

    // All visualizations
    this.addAllVisualizations(pres, content);
  }

  /**
   * Add slides for technical audience
   */
  private addTechnicalSlides(
    pres: PptxGenJS,
    content: PresentationContent,
    options: PresentationOptions
  ): void {
    // Methodology
    if (content.methodology && options.includeMethodology) {
      const slide = pres.addSlide();
      slide.addText('Methodology', { x: 0.5, y: 0.5, fontSize: 32, bold: true });
      slide.addText(content.methodology, { x: 0.5, y: 1.5, w: 9, h: 4.5, fontSize: 16 });
    }

    // Model diagnostics
    if (content.modelDiagnostics && options.includeModelDiagnostics) {
      this.addModelDiagnosticsSlide(pres, content.modelDiagnostics);
    }

    // Feature importance
    if (content.featureImportance && content.featureImportance.length > 0) {
      this.addFeatureImportanceSlide(pres, content.featureImportance);
    }

    // All visualizations + data tables
    this.addAllVisualizations(pres, content);
    this.addDataTables(pres, content);
  }

  /**
   * Add slides for consultation audience
   */
  private addConsultationSlides(
    pres: PptxGenJS,
    content: PresentationContent,
    options: PresentationOptions
  ): void {
    // Mix of business and technical content
    this.addBusinessSlides(pres, content);

    if (options.includeTechnicalDetails) {
      this.addTechnicalSlides(pres, content, options);
    }
  }

  private addSimpleVisualizations(pres: PptxGenJS, content: PresentationContent): void {
    // Add only key visualizations for non-tech audience
    content.visualizations?.slice(0, 3).forEach(viz => {
      const slide = pres.addSlide();
      slide.addText(viz.title, { x: 0.5, y: 0.5, fontSize: 28, bold: true });

      if (viz.imagePath || viz.imageBuffer) {
        // Add pre-rendered image
        slide.addImage({
          data: viz.imageBuffer ? viz.imageBuffer.toString('base64') : viz.imagePath!,
          x: 1,
          y: 1.5,
          w: 8,
          h: 4.5
        });
      }
    });
  }

  private addAllVisualizations(pres: PptxGenJS, content: PresentationContent): void {
    // Add all visualizations
    content.visualizations?.forEach(viz => {
      const slide = pres.addSlide();
      slide.addText(viz.title, { x: 0.5, y: 0.5, fontSize: 28, bold: true });

      if (viz.description) {
        slide.addText(viz.description, { x: 0.5, y: 6.5, fontSize: 12, color: '666666' });
      }

      if (viz.imagePath || viz.imageBuffer) {
        slide.addImage({
          data: viz.imageBuffer ? viz.imageBuffer.toString('base64') : viz.imagePath!,
          x: 1,
          y: 1.5,
          w: 8,
          h: 4.5
        });
      }
    });
  }

  private addDataTables(pres: PptxGenJS, content: PresentationContent): void {
    content.dataTables?.forEach(table => {
      const slide = pres.addSlide();
      slide.addText(table.title, { x: 0.5, y: 0.5, fontSize: 28, bold: true });

  const tableRows = [table.headers, ...table.rows] as unknown as any;

      slide.addTable(tableRows, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 4.5,
        fontSize: 12,
        border: { type: 'solid', color: 'CFCFCF' }
      });
    });
  }

  private addModelDiagnosticsSlide(pres: PptxGenJS, diagnostics: ModelDiagnostics): void {
    const slide = pres.addSlide();
    slide.addText('Model Performance Diagnostics', { x: 0.5, y: 0.5, fontSize: 28, bold: true });

    const metrics = [
      ['Metric', 'Value'],
      ['Model Type', diagnostics.modelType],
      ...(diagnostics.accuracy !== undefined ? [['Accuracy', `${(diagnostics.accuracy * 100).toFixed(2)}%`]] : []),
      ...(diagnostics.precision !== undefined ? [['Precision', `${(diagnostics.precision * 100).toFixed(2)}%`]] : []),
      ...(diagnostics.recall !== undefined ? [['Recall', `${(diagnostics.recall * 100).toFixed(2)}%`]] : []),
      ...(diagnostics.f1Score !== undefined ? [['F1 Score', diagnostics.f1Score.toFixed(4)]] : []),
      ...(diagnostics.rmse !== undefined ? [['RMSE', diagnostics.rmse.toFixed(4)]] : []),
      ...(diagnostics.r2Score !== undefined ? [['R² Score', diagnostics.r2Score.toFixed(4)]] : []),
    ];

  const metricRows = metrics as unknown as any;

  slide.addTable(metricRows, {
      x: 0.5,
      y: 1.5,
      w: 4,
      h: 4.5,
      fontSize: 14,
      border: { type: 'solid', color: 'CFCFCF' }
    });
  }

  private addFeatureImportanceSlide(pres: PptxGenJS, features: FeatureImportance[]): void {
    const slide = pres.addSlide();
    slide.addText('Feature Importance', { x: 0.5, y: 0.5, fontSize: 28, bold: true });

    const tableData = [
      ['Rank', 'Feature', 'Importance'],
      ...features.slice(0, 10).map(f => [
        f.rank.toString(),
        f.feature,
        f.importance.toFixed(4)
      ])
    ];

  const featureRows = tableData as unknown as any;

  slide.addTable(featureRows, {
      x: 0.5,
      y: 1.5,
      w: 9,
      h: 4.5,
      fontSize: 14,
      border: { type: 'solid', color: 'CFCFCF' }
    });
  }
}

// Export singleton instance
export const presentationGenerator = new PresentationGenerator();
