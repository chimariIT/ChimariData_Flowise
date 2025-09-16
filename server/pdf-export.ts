import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

export interface ExportData {
  projectName: string;
  projectDescription?: string;
  analysisResults?: any;
  visualizations?: any[];
  schema?: Record<string, any>;
  recordCount?: number;
  createdAt: Date;
}

export interface PDFExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export class PDFExportService {
  private static tempDir = path.join(process.cwd(), 'temp', 'exports');

  static async ensurePythonDir() {
    const pythonDir = path.join(process.cwd(), 'python');
    try {
      await fs.mkdir(pythonDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create python directory:', error);
    }
  }

  static async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create export temp directory:', error);
    }
  }

  static async exportToPDF(data: ExportData, exportId: string): Promise<PDFExportResult> {
    await this.ensureTempDir();
    await this.ensurePythonDir();
    
    const scriptPath = path.join(process.cwd(), 'python', 'pdf_generator.py');
    const dataPath = path.join(this.tempDir, `export_data_${exportId}.json`);
    const outputPath = path.join(this.tempDir, `analysis_report_${exportId}.pdf`);

    try {
      // Write export data to temporary file
      await fs.writeFile(dataPath, JSON.stringify({
        project_name: data.projectName,
        project_description: data.projectDescription || '',
        analysis_results: data.analysisResults || {},
        visualizations: data.visualizations || [],
        schema: data.schema || {},
        record_count: data.recordCount || 0,
        created_at: data.createdAt.toISOString(),
        output_path: outputPath
      }));

      // Create Python PDF generation script if it doesn't exist
      await this.ensurePythonScript(scriptPath);

      return new Promise((resolve) => {
        const pythonProcess = spawn('python3', [scriptPath, dataPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        pythonProcess.on('close', async (code) => {
          try {
            // Clean up data file
            await fs.unlink(dataPath).catch(() => {});

            if (code !== 0) {
              console.error('Python PDF generation error:', stderr);
              resolve({
                success: false,
                error: `PDF generation failed: ${stderr}`
              });
              return;
            }

            // Check if PDF was generated successfully
            try {
              await fs.access(outputPath);
              resolve({
                success: true,
                filePath: outputPath
              });
            } catch (fileError) {
              resolve({
                success: false,
                error: `PDF file was not generated: ${fileError}`
              });
            }
          } catch (error) {
            resolve({
              success: false,
              error: `Export cleanup error: ${error}`
            });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        error: `Failed to prepare export: ${error}`
      };
    }
  }

  private static async ensurePythonScript(scriptPath: string) {
    const pythonDir = path.dirname(scriptPath);
    await fs.mkdir(pythonDir, { recursive: true }).catch(() => {});

    const pythonScript = `
import json
import sys
from datetime import datetime
import matplotlib.pyplot as plt
import matplotlib.backends.backend_pdf as pdf_backend
from matplotlib.backends.backend_pdf import PdfPages
import seaborn as sns
import pandas as pd
import numpy as np
import base64
from io import BytesIO
from PIL import Image
import warnings
warnings.filterwarnings('ignore')

def create_pdf_report(export_data):
    output_path = export_data['output_path']
    
    # Create PDF with multiple pages
    with PdfPages(output_path) as pdf:
        # Set overall style
        plt.style.use('seaborn-v0_8-whitegrid')
        
        # Page 1: Title and Project Overview
        fig = plt.figure(figsize=(8.5, 11))
        fig.suptitle('Data Analysis Report', fontsize=24, fontweight='bold', y=0.95)
        
        # Project information
        ax = fig.add_subplot(111)
        ax.axis('off')
        
        project_info = f"""
Project: {export_data.get('project_name', 'Untitled Project')}
Description: {export_data.get('project_description', 'No description provided')}
Records: {export_data.get('record_count', 'Unknown')}
Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}

---

EXECUTIVE SUMMARY

This report contains comprehensive analysis results including:
• Statistical analysis and data distributions
• Correlation analysis between variables  
• Data visualizations and charts
• Key insights and recommendations

The analysis was performed using advanced statistical methods
and machine learning techniques to extract meaningful insights
from your dataset.
        """
        
        ax.text(0.1, 0.8, project_info, fontsize=12, verticalalignment='top',
                transform=ax.transAxes, wrap=True)
        
        pdf.savefig(fig, bbox_inches='tight')
        plt.close()
        
        # Page 2: Schema and Data Overview
        if export_data.get('schema'):
            fig, ax = plt.subplots(figsize=(8.5, 11))
            ax.axis('off')
            fig.suptitle('Data Schema Overview', fontsize=16, fontweight='bold')
            
            schema_text = "DATASET STRUCTURE\\n\\n"
            schema = export_data['schema']
            
            for i, (field, info) in enumerate(schema.items()):
                field_type = info.get('type', 'unknown')
                sample_val = str(info.get('sample', ''))[:50]
                if len(str(info.get('sample', ''))) > 50:
                    sample_val += "..."
                    
                schema_text += f"{i+1}. {field}\\n"
                schema_text += f"   Type: {field_type}\\n"
                schema_text += f"   Sample: {sample_val}\\n\\n"
            
            ax.text(0.1, 0.9, schema_text, fontsize=10, verticalalignment='top',
                   transform=ax.transAxes, fontfamily='monospace')
            
            pdf.savefig(fig, bbox_inches='tight')
            plt.close()
        
        # Page 3+: Analysis Results
        analysis_results = export_data.get('analysis_results', {})
        if analysis_results:
            for analysis_type, results in analysis_results.items():
                fig, ax = plt.subplots(figsize=(8.5, 11))
                ax.axis('off')
                fig.suptitle(f'{analysis_type.title()} Analysis Results', 
                           fontsize=16, fontweight='bold')
                
                results_text = format_analysis_results(analysis_type, results)
                ax.text(0.1, 0.9, results_text, fontsize=10, verticalalignment='top',
                       transform=ax.transAxes)
                
                pdf.savefig(fig, bbox_inches='tight')
                plt.close()
        
        # Pages for Visualizations
        visualizations = export_data.get('visualizations', [])
        for viz in visualizations:
            if 'imageData' in viz:
                try:
                    # Decode base64 image
                    image_data = base64.b64decode(viz['imageData'])
                    image = Image.open(BytesIO(image_data))
                    
                    fig, ax = plt.subplots(figsize=(8.5, 11))
                    ax.axis('off')
                    fig.suptitle(f"Visualization: {viz.get('type', 'Chart').title()}", 
                               fontsize=16, fontweight='bold')
                    
                    # Display the image
                    ax.imshow(image)
                    
                    # Add insights if available
                    if viz.get('insights'):
                        insights_text = "Key Insights:\\n" + "\\n".join(f"• {insight}" for insight in viz['insights'])
                        fig.text(0.1, 0.02, insights_text, fontsize=10, wrap=True)
                    
                    pdf.savefig(fig, bbox_inches='tight', dpi=150)
                    plt.close()
                    
                except Exception as e:
                    print(f"Error processing visualization: {e}")
                    continue
        
        # Final page: Summary and Recommendations
        fig, ax = plt.subplots(figsize=(8.5, 11))
        ax.axis('off')
        fig.suptitle('Summary & Recommendations', fontsize=16, fontweight='bold')
        
        summary_text = f"""
ANALYSIS SUMMARY

This comprehensive analysis of "{export_data.get('project_name', 'your dataset')}" 
has revealed important insights about your data patterns and relationships.

KEY FINDINGS:
• Dataset contains {export_data.get('record_count', 'N/A')} records
• Multiple variable types analyzed including numeric and categorical data
• Statistical relationships identified through correlation analysis
• Data distributions and patterns visualized through various chart types

RECOMMENDATIONS:
• Consider the insights highlighted in each visualization
• Pay attention to strong correlations (>0.7 or <-0.7) between variables
• Review data quality indicators for any missing or outlier values
• Use these findings to inform business decisions and strategy

NEXT STEPS:
• Implement findings in your business processes
• Continue monitoring key metrics identified in this analysis
• Consider additional data collection based on insights discovered
• Share relevant findings with stakeholders and decision-makers

---

Report generated by ChimariData Analytics Platform
For questions or additional analysis, please contact our support team.
        """
        
        ax.text(0.1, 0.9, summary_text, fontsize=11, verticalalignment='top',
               transform=ax.transAxes, wrap=True)
        
        pdf.savefig(fig, bbox_inches='tight')
        plt.close()
    
    print(f"PDF report generated successfully: {output_path}")
    return True

def format_analysis_results(analysis_type, results):
    """Format analysis results for display in PDF"""
    formatted = f"{analysis_type.upper()} RESULTS\\n\\n"
    
    if analysis_type == 'descriptive':
        if 'statistics' in results:
            formatted += "DESCRIPTIVE STATISTICS:\\n"
            for field, stats in results['statistics'].items():
                formatted += f"\\n{field}:\\n"
                for stat_name, stat_value in stats.items():
                    formatted += f"  {stat_name}: {stat_value}\\n"
    
    elif analysis_type == 'correlation':
        if 'correlations' in results:
            formatted += "CORRELATION ANALYSIS:\\n\\n"
            for corr in results['correlations']:
                formatted += f"{corr.get('field1', '')} ↔ {corr.get('field2', '')}: {corr.get('correlation', 'N/A')}\\n"
    
    elif analysis_type == 'distribution':
        if 'distributions' in results:
            formatted += "DISTRIBUTION ANALYSIS:\\n\\n"
            for dist in results['distributions']:
                field = dist.get('field', 'Unknown')
                field_type = dist.get('type', 'unknown')
                formatted += f"{field} ({field_type}):\\n"
                
                if 'statistics' in dist:
                    for stat_name, stat_value in dist['statistics'].items():
                        formatted += f"  {stat_name}: {stat_value}\\n"
                formatted += "\\n"
    
    else:
        # Generic formatting for other analysis types
        formatted += str(results)[:1000]
        if len(str(results)) > 1000:
            formatted += "\\n\\n[Results truncated - see full analysis in application]"
    
    return formatted

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 pdf_generator.py <export_data_file>")
        sys.exit(1)
    
    data_file = sys.argv[1]
    
    try:
        with open(data_file, 'r') as f:
            export_data = json.load(f)
        
        success = create_pdf_report(export_data)
        sys.exit(0 if success else 1)
        
    except Exception as e:
        print(f"Error generating PDF: {str(e)}")
        sys.exit(1)
`;

    try {
      await fs.writeFile(scriptPath, pythonScript);
    } catch (error) {
      console.error('Failed to write Python PDF script:', error);
    }
  }

  static async cleanupTempFiles(maxAgeHours: number = 24) {
    try {
      const files = await fs.readdir(this.tempDir);
      const maxAge = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < maxAge) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}