import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface StepByStepAnalysisConfig {
  question: string;
  targetVariable: string;
  multivariateVariables: string[];
  analysisType: 'anova' | 'ancova' | 'manova' | 'mancova' | 'regression' | 'machine_learning';
  additionalOptions?: {
    covariates?: string[];
    interactions?: boolean;
    postHoc?: string;
    alpha?: number;
    modelType?: string;
    crossValidation?: boolean;
  };
}

export interface AnalysisResult {
  analysisType: string;
  question: string;
  results: any;
  interpretation: string;
  recommendations: string[];
  visualizations?: string[];
  statistics: any;
}

export class AdvancedAnalyzer {
  private static ensureDataDir(): string {
    const dataDir = path.join(process.cwd(), 'python_data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return dataDir;
  }

  static async performStepByStepAnalysis(
    data: any[], 
    config: StepByStepAnalysisConfig
  ): Promise<AnalysisResult> {
    const dataDir = this.ensureDataDir();
    const inputFile = path.join(dataDir, `analysis_input_${Date.now()}.json`);
    const configFile = path.join(dataDir, `analysis_config_${Date.now()}.json`);
    const outputFile = path.join(dataDir, `analysis_output_${Date.now()}.json`);

    try {
      fs.writeFileSync(inputFile, JSON.stringify(data));
      fs.writeFileSync(configFile, JSON.stringify(config));

      const scriptPath = this.getAnalysisScript(config.analysisType);
      const result = await this.runPythonScript(scriptPath, [inputFile, configFile, outputFile]);

      if (result.success && fs.existsSync(outputFile)) {
        const output = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        return {
          analysisType: config.analysisType,
          question: config.question,
          results: output.results,
          interpretation: output.interpretation,
          recommendations: output.recommendations,
          visualizations: output.visualizations,
          statistics: output.statistics
        };
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } finally {
      // Cleanup
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
      if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    }
  }

  static async performANOVA(
    data: any[], 
    targetVariable: string, 
    factorVariables: string[], 
    options: any = {}
  ): Promise<AnalysisResult> {
    return this.performStepByStepAnalysis(data, {
      question: `Does ${factorVariables.join(', ')} significantly affect ${targetVariable}?`,
      targetVariable,
      multivariateVariables: factorVariables,
      analysisType: 'anova',
      additionalOptions: options
    });
  }

  static async performANCOVA(
    data: any[], 
    targetVariable: string, 
    factorVariables: string[], 
    covariates: string[], 
    options: any = {}
  ): Promise<AnalysisResult> {
    return this.performStepByStepAnalysis(data, {
      question: `Does ${factorVariables.join(', ')} significantly affect ${targetVariable} after controlling for ${covariates.join(', ')}?`,
      targetVariable,
      multivariateVariables: factorVariables,
      analysisType: 'ancova',
      additionalOptions: { ...options, covariates }
    });
  }

  static async performMANOVA(
    data: any[], 
    targetVariables: string[], 
    factorVariables: string[], 
    options: any = {}
  ): Promise<AnalysisResult> {
    return this.performStepByStepAnalysis(data, {
      question: `Does ${factorVariables.join(', ')} significantly affect the combination of ${targetVariables.join(', ')}?`,
      targetVariable: targetVariables.join(', '),
      multivariateVariables: factorVariables,
      analysisType: 'manova',
      additionalOptions: options
    });
  }

  static async performMANCOVA(
    data: any[], 
    targetVariables: string[], 
    factorVariables: string[], 
    covariates: string[], 
    options: any = {}
  ): Promise<AnalysisResult> {
    return this.performStepByStepAnalysis(data, {
      question: `Does ${factorVariables.join(', ')} significantly affect the combination of ${targetVariables.join(', ')} after controlling for ${covariates.join(', ')}?`,
      targetVariable: targetVariables.join(', '),
      multivariateVariables: factorVariables,
      analysisType: 'mancova',
      additionalOptions: { ...options, covariates }
    });
  }

  static async performRegression(
    data: any[], 
    targetVariable: string, 
    predictorVariables: string[], 
    options: any = {}
  ): Promise<AnalysisResult> {
    return this.performStepByStepAnalysis(data, {
      question: `How well do ${predictorVariables.join(', ')} predict ${targetVariable}?`,
      targetVariable,
      multivariateVariables: predictorVariables,
      analysisType: 'regression',
      additionalOptions: options
    });
  }

  static async performMachineLearning(
    data: any[], 
    targetVariable: string, 
    featureVariables: string[], 
    modelType: string = 'random_forest',
    options: any = {}
  ): Promise<AnalysisResult> {
    return this.performStepByStepAnalysis(data, {
      question: `Can we predict ${targetVariable} using ${featureVariables.join(', ')} with ${modelType}?`,
      targetVariable,
      multivariateVariables: featureVariables,
      analysisType: 'machine_learning',
      additionalOptions: { ...options, modelType }
    });
  }

  private static getAnalysisScript(analysisType: string): string {
    const scriptMap: Record<string, string> = {
      'anova': 'advanced_anova.py',
      'ancova': 'advanced_ancova.py',
      'manova': 'advanced_manova.py',
      'mancova': 'advanced_mancova.py',
      'regression': 'advanced_regression.py',
      'machine_learning': 'advanced_ml.py'
    };

    const scriptName = scriptMap[analysisType];
    if (!scriptName) {
      throw new Error(`Unknown analysis type: ${analysisType}`);
    }

    return path.join(process.cwd(), 'python_scripts', scriptName);
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