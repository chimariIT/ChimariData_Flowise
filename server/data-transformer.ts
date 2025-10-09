import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface DataJoinConfig {
  leftFile: string;
  rightFile: string;
  joinType: 'inner' | 'left' | 'right' | 'outer';
  leftKey: string;
  rightKey: string;
  suffix?: string;
}

export interface OutlierDetectionConfig {
  columns: string[];
  method: 'zscore' | 'iqr' | 'isolation_forest';
  threshold: number;
}

export interface MissingDataConfig {
  strategy: 'analyze' | 'impute' | 'remove';
  method?: 'mean' | 'median' | 'mode' | 'forward_fill' | 'backward_fill';
  columns?: string[];
}

export interface NormalityTestConfig {
  columns: string[];
  tests: ('shapiro' | 'kolmogorov' | 'jarque_bera' | 'anderson')[];
  alpha: number;
}

export class DataTransformer {
  private static ensureDataDir(): string {
    const dataDir = path.join(process.cwd(), 'python_data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return dataDir;
  }

  static async joinData(config: DataJoinConfig): Promise<any> {
    const dataDir = this.ensureDataDir();
    const configFile = path.join(dataDir, `join_config_${Date.now()}.json`);
    const outputFile = path.join(dataDir, `join_output_${Date.now()}.json`);

    try {
      fs.writeFileSync(configFile, JSON.stringify(config));

      const scriptPath = path.join(process.cwd(), 'python_scripts', 'data_joiner.py');
      const result = await this.runPythonScript(scriptPath, [configFile, outputFile]);

      if (result.success && fs.existsSync(outputFile)) {
        const output = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        return output;
      } else {
        throw new Error(result.error || 'Data join failed');
      }
    } finally {
      // Cleanup
      if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    }
  }

  static async detectOutliers(data: any[], config: OutlierDetectionConfig): Promise<any> {
    const dataDir = this.ensureDataDir();
    const inputFile = path.join(dataDir, `outlier_input_${Date.now()}.json`);
    const configFile = path.join(dataDir, `outlier_config_${Date.now()}.json`);
    const outputFile = path.join(dataDir, `outlier_output_${Date.now()}.json`);

    try {
      fs.writeFileSync(inputFile, JSON.stringify(data));
      fs.writeFileSync(configFile, JSON.stringify(config));

      const scriptPath = path.join(process.cwd(), 'python_scripts', 'outlier_detector.py');
      const result = await this.runPythonScript(scriptPath, [inputFile, configFile, outputFile]);

      if (result.success && fs.existsSync(outputFile)) {
        const output = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        return output;
      } else {
        throw new Error(result.error || 'Outlier detection failed');
      }
    } finally {
      // Cleanup
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    }
  }

  static async analyzeMissingData(data: any[], config: MissingDataConfig): Promise<any> {
    const dataDir = this.ensureDataDir();
    const inputFile = path.join(dataDir, `missing_input_${Date.now()}.json`);
    const configFile = path.join(dataDir, `missing_config_${Date.now()}.json`);
    const outputFile = path.join(dataDir, `missing_output_${Date.now()}.json`);

    try {
      fs.writeFileSync(inputFile, JSON.stringify(data));
      fs.writeFileSync(configFile, JSON.stringify(config));

      const scriptPath = path.join(process.cwd(), 'python_scripts', 'missing_data_analyzer.py');
      const result = await this.runPythonScript(scriptPath, [inputFile, configFile, outputFile]);

      if (result.success && fs.existsSync(outputFile)) {
        const output = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        return output;
      } else {
        throw new Error(result.error || 'Missing data analysis failed');
      }
    } finally {
      // Cleanup
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    }
  }

  static async testNormality(data: any[], config: NormalityTestConfig): Promise<any> {
    const dataDir = this.ensureDataDir();
    const inputFile = path.join(dataDir, `normality_input_${Date.now()}.json`);
    const configFile = path.join(dataDir, `normality_config_${Date.now()}.json`);
    const outputFile = path.join(dataDir, `normality_output_${Date.now()}.json`);

    try {
      fs.writeFileSync(inputFile, JSON.stringify(data));
      fs.writeFileSync(configFile, JSON.stringify(config));

      const scriptPath = path.join(process.cwd(), 'python_scripts', 'normality_tester.py');
      const result = await this.runPythonScript(scriptPath, [inputFile, configFile, outputFile]);

      if (result.success && fs.existsSync(outputFile)) {
        const output = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        return output;
      } else {
        throw new Error(result.error || 'Normality testing failed');
      }
    } finally {
      // Cleanup
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
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
}