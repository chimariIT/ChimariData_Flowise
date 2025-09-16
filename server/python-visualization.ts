import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface VisualizationRequest {
  data: Record<string, any>[];
  schema: Record<string, any>;
  visualizationType: string;
  selectedColumns?: string[];
  groupByColumn?: string;
  colorByColumn?: string;
}

export interface VisualizationResult {
  success: boolean;
  imagePath?: string;
  imageData?: string; // base64 encoded
  error?: string;
  insights?: string[];
}

export class PythonVisualizationService {
  private static tempDir = path.join(process.cwd(), 'temp', 'visualizations');

  static async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  static async createVisualization(request: VisualizationRequest, projectId: string): Promise<VisualizationResult> {
    await this.ensureTempDir();
    
    const scriptPath = path.join(process.cwd(), 'python', 'visualization_generator.py');
    const dataPath = path.join(this.tempDir, `data_${projectId}_${Date.now()}.json`);
    const outputPath = path.join(this.tempDir, `viz_${projectId}_${Date.now()}.png`);

    try {
      // Write data to temporary file
      await fs.writeFile(dataPath, JSON.stringify({
        data: request.data,
        schema: request.schema,
        visualization_type: request.visualizationType,
        selected_columns: request.selectedColumns || [],
        group_by_column: request.groupByColumn,
        color_by_column: request.colorByColumn,
        output_path: outputPath
      }));

      // Create Python script if it doesn't exist
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
              console.error('Python visualization error:', stderr);
              resolve({
                success: false,
                error: `Visualization generation failed: ${stderr}`
              });
              return;
            }

            // Read generated image
            try {
              const imageBuffer = await fs.readFile(outputPath);
              const imageData = imageBuffer.toString('base64');
              
              // Parse insights from stdout
              const insights = stdout.split('\n').filter(line => line.startsWith('INSIGHT:')).map(line => line.replace('INSIGHT:', '').trim());

              // Clean up image file
              await fs.unlink(outputPath).catch(() => {});

              resolve({
                success: true,
                imageData,
                insights
              });
            } catch (fileError) {
              resolve({
                success: false,
                error: `Failed to read generated visualization: ${fileError}`
              });
            }
          } catch (error) {
            resolve({
              success: false,
              error: `Cleanup error: ${error}`
            });
          }
        });
      });
    } catch (error) {
      return {
        success: false,
        error: `Failed to create visualization: ${error}`
      };
    }
  }

  private static async ensurePythonScript(scriptPath: string) {
    const pythonDir = path.dirname(scriptPath);
    await fs.mkdir(pythonDir, { recursive: true }).catch(() => {});

    const pythonScript = `
import json
import sys
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import warnings
warnings.filterwarnings('ignore')

def create_visualization(config):
    data = pd.DataFrame(config['data'])
    viz_type = config['visualization_type']
    selected_columns = config.get('selected_columns', [])
    group_by = config.get('group_by_column')
    color_by = config.get('color_by_column')
    output_path = config['output_path']
    
    # Set style
    plt.style.use('seaborn-v0_8-darkgrid')
    plt.figure(figsize=(12, 8))
    
    try:
        if viz_type == 'correlation_matrix':
            numeric_cols = data.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) > 1:
                corr_matrix = data[numeric_cols].corr()
                sns.heatmap(corr_matrix, annot=True, cmap='coolwarm', center=0,
                           square=True, fmt='.2f', cbar_kws={'shrink': 0.8})
                plt.title('Correlation Matrix')
                print("INSIGHT: Strong correlations (>0.7 or <-0.7) indicate relationships between variables")
        
        elif viz_type == 'distribution':
            if selected_columns:
                col = selected_columns[0]
                if data[col].dtype in ['int64', 'float64']:
                    plt.subplot(1, 2, 1)
                    sns.histplot(data[col], kde=True)
                    plt.title(f'Distribution of {col}')
                    
                    plt.subplot(1, 2, 2)
                    sns.boxplot(y=data[col])
                    plt.title(f'Box Plot of {col}')
                    print(f"INSIGHT: Mean: {data[col].mean():.2f}, Median: {data[col].median():.2f}")
        
        elif viz_type == 'scatter_plot':
            if len(selected_columns) >= 2:
                x_col, y_col = selected_columns[0], selected_columns[1]
                if color_by and color_by in data.columns:
                    sns.scatterplot(data=data, x=x_col, y=y_col, hue=color_by, s=60, alpha=0.7)
                else:
                    sns.scatterplot(data=data, x=x_col, y=y_col, s=60, alpha=0.7)
                plt.title(f'{y_col} vs {x_col}')
                correlation = data[x_col].corr(data[y_col])
                print(f"INSIGHT: Correlation coefficient: {correlation:.3f}")
        
        elif viz_type == 'bar_chart':
            if selected_columns:
                col = selected_columns[0]
                if data[col].dtype == 'object':
                    value_counts = data[col].value_counts().head(10)
                    sns.barplot(x=value_counts.values, y=value_counts.index)
                    plt.title(f'Top Values in {col}')
                    print(f"INSIGHT: Most common value: {value_counts.index[0]} ({value_counts.iloc[0]} occurrences)")
        
        elif viz_type == 'multivariate':
            numeric_cols = data.select_dtypes(include=[np.number]).columns[:4]
            if len(numeric_cols) >= 2:
                sns.pairplot(data[numeric_cols], diag_kind='kde', plot_kws={'alpha': 0.6})
                plt.suptitle('Multivariate Analysis', y=1.02)
                print("INSIGHT: Pairplot reveals relationships between multiple variables simultaneously")
        
        else:
            # Default to basic statistics plot
            numeric_cols = data.select_dtypes(include=[np.number]).columns[:5]
            if len(numeric_cols) > 0:
                data[numeric_cols].describe().T.plot(kind='bar', stacked=True)
                plt.title('Statistical Summary')
                plt.xticks(rotation=45)
                print("INSIGHT: Statistical summary shows central tendency and spread of numeric variables")
        
        plt.tight_layout()
        plt.savefig(output_path, dpi=300, bbox_inches='tight', facecolor='white')
        plt.close()
        return True
        
    except Exception as e:
        print(f"Visualization error: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 visualization_generator.py <config_file>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
        
        success = create_visualization(config)
        sys.exit(0 if success else 1)
        
    except Exception as e:
        print(f"Error loading configuration: {str(e)}")
        sys.exit(1)
`;

    try {
      await fs.writeFile(scriptPath, pythonScript);
    } catch (error) {
      console.error('Failed to write Python script:', error);
    }
  }
}