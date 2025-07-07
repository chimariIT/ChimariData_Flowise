import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface PythonProcessorOptions {
  projectId: string;
  operation: 'transform' | 'analyze' | 'visualize' | 'trial_analysis';
  data: any;
  config?: any;
}

export interface PythonProcessorResult {
  success: boolean;
  data?: any;
  error?: string;
  visualizations?: string[]; // Base64 encoded images
}

export class PythonProcessor {
  private static ensureDataDir() {
    const dataDir = path.join(process.cwd(), 'python_data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return dataDir;
  }

  static async processData(options: PythonProcessorOptions): Promise<PythonProcessorResult> {
    const { projectId, operation, data, config } = options;
    const dataDir = this.ensureDataDir();
    
    try {
      // Write input data to temporary file
      const inputFile = path.join(dataDir, `${projectId}_input.json`);
      const configFile = path.join(dataDir, `${projectId}_config.json`);
      const outputFile = path.join(dataDir, `${projectId}_output.json`);
      
      fs.writeFileSync(inputFile, JSON.stringify(data));
      fs.writeFileSync(configFile, JSON.stringify(config || {}));
      
      // Determine which Python script to run
      const scriptName = this.getScriptName(operation);
      const scriptPath = path.join(process.cwd(), 'python_scripts', scriptName);
      
      // Run Python script
      const result = await this.runPythonScript(scriptPath, [inputFile, configFile, outputFile]);
      
      if (result.success && fs.existsSync(outputFile)) {
        const output = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        
        // Clean up temporary files
        this.cleanupFiles([inputFile, configFile, outputFile]);
        
        return {
          success: true,
          data: output.data,
          visualizations: output.visualizations || []
        };
      } else {
        return {
          success: false,
          error: result.error || 'Python processing failed'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Processing error: ${error.message}`
      };
    }
  }

  private static getScriptName(operation: string): string {
    switch (operation) {
      case 'transform':
        return 'data_transformer.py';
      case 'analyze':
        return 'data_analyzer.py';
      case 'visualize':
        return 'data_visualizer.py';
      case 'trial_analysis':
        return 'trial_analyzer.py';
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private static async runPythonScript(scriptPath: string, args: string[]): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const pythonProcess = spawn('python3', [scriptPath, ...args]);
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ 
            success: false, 
            error: stderr || `Python script exited with code ${code}` 
          });
        }
      });
      
      pythonProcess.on('error', (error) => {
        resolve({ 
          success: false, 
          error: `Failed to start Python process: ${error.message}` 
        });
      });
    });
  }

  private static cleanupFiles(files: string[]) {
    files.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.warn(`Failed to cleanup file ${file}:`, error.message);
      }
    });
  }

  // Free trial processing
  static async processTrial(projectId: string, data: any): Promise<PythonProcessorResult> {
    return this.processData({
      projectId,
      operation: 'trial_analysis',
      data,
      config: { 
        include_descriptive: true,
        include_visualizations: true,
        max_visualizations: 3
      }
    });
  }

  // Data transformation
  static async transformData(projectId: string, data: any, transformations: any[]): Promise<PythonProcessorResult> {
    return this.processData({
      projectId,
      operation: 'transform',
      data,
      config: { transformations }
    });
  }

  // Statistical analysis
  static async analyzeData(projectId: string, data: any, analysisType: string, config: any): Promise<PythonProcessorResult> {
    return this.processData({
      projectId,
      operation: 'analyze',
      data,
      config: { analysisType, ...config }
    });
  }

  // Data visualization
  static async visualizeData(projectId: string, data: any, chartTypes: string[], config: any): Promise<PythonProcessorResult> {
    return this.processData({
      projectId,
      operation: 'visualize',
      data,
      config: { chartTypes, ...config }
    });
  }
}