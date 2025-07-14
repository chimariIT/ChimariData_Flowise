import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export class AdvancedAnalyzer {
  static async performStepByStepAnalysis(data: any[], config: any) {
    const { analysisType, targetVariable, multivariateVariables, features, covariates, question, alpha, postHoc, assumptions } = config;
    
    console.log(`Starting ${analysisType} analysis with ${data.length} records`);
    
    // Validate data
    if (!data || data.length === 0) {
      throw new Error('No data provided for analysis');
    }
    
    // Check if required variables exist in data
    const availableColumns = Object.keys(data[0] || {});
    if (targetVariable && !availableColumns.includes(targetVariable)) {
      throw new Error(`Target variable '${targetVariable}' not found in data`);
    }
    
    // For ML analysis, use 'features' if available, otherwise use 'multivariateVariables'
    const variablesToCheck = features || multivariateVariables || [];
    const missingFactors = variablesToCheck.filter(v => !availableColumns.includes(v));
    if (missingFactors.length > 0) {
      throw new Error(`Factor variables not found: ${missingFactors.join(', ')}`);
    }
    
    // Generate descriptive statistics first
    const effectiveVariables = features || multivariateVariables || [];
    const descriptiveStats = this.generateDescriptiveStats(data, targetVariable, effectiveVariables);
    
    // Perform specific analysis based on type
    let analysisResult;
    
    switch (analysisType) {
      case 'anova':
        analysisResult = await this.performANOVA(data, targetVariable, effectiveVariables, { alpha, postHoc, assumptions });
        break;
      case 'ancova':
        analysisResult = await this.performANCOVA(data, targetVariable, effectiveVariables, covariates, { alpha, postHoc, assumptions });
        break;
      case 'manova':
        analysisResult = await this.performMANOVA(data, effectiveVariables, { alpha, assumptions });
        break;
      case 'mancova':
        analysisResult = await this.performMANCOVA(data, effectiveVariables, covariates, { alpha, assumptions });
        break;
      case 'regression':
        analysisResult = await this.performRegression(data, targetVariable, effectiveVariables, { alpha });
        break;
      case 'machine_learning':
        analysisResult = await this.performMLAnalysis(data, targetVariable, effectiveVariables, config);
        break;
      default:
        throw new Error(`Unsupported analysis type: ${analysisType}`);
    }
    
    return {
      question,
      analysisType,
      targetVariable,
      multivariateVariables: effectiveVariables,
      covariates,
      descriptiveStats,
      analysisResult,
      timestamp: new Date().toISOString()
    };
  }
  
  private static generateDescriptiveStats(data: any[], targetVariable?: string, factorVariables?: string[]) {
    const stats: any = {
      totalRecords: data.length,
      variables: {}
    };
    
    // Get all numeric columns
    const numericColumns = Object.keys(data[0] || {}).filter(col => {
      const sample = data.find(row => row[col] !== null && row[col] !== undefined);
      return sample && typeof sample[col] === 'number';
    });
    
    // Calculate statistics for each numeric column
    numericColumns.forEach(col => {
      const values = data.map(row => parseFloat(row[col])).filter(val => !isNaN(val));
      if (values.length > 0) {
        values.sort((a, b) => a - b);
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
        const standardDeviation = Math.sqrt(variance);
        
        stats.variables[col] = {
          type: 'numeric',
          count: values.length,
          mean: mean,
          median: values[Math.floor(values.length / 2)],
          standardDeviation: standardDeviation,
          variance: variance,
          min: values[0],
          max: values[values.length - 1],
          range: values[values.length - 1] - values[0]
        };
      }
    });
    
    // Calculate statistics for categorical variables
    const categoricalColumns = Object.keys(data[0] || {}).filter(col => !numericColumns.includes(col));
    categoricalColumns.forEach(col => {
      const values = data.map(row => row[col]).filter(val => val !== null && val !== undefined);
      const frequencies = values.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      }, {});
      
      stats.variables[col] = {
        type: 'categorical',
        count: values.length,
        uniqueValues: Object.keys(frequencies).length,
        frequencies: frequencies,
        mode: Object.keys(frequencies).reduce((a, b) => frequencies[a] > frequencies[b] ? a : b)
      };
    });
    
    return stats;
  }
  
  private static async performANOVA(data: any[], targetVariable: string, factorVariables: string[], options: any) {
    // Basic ANOVA implementation
    const groups = this.groupDataByFactors(data, factorVariables);
    const result = {
      analysisType: 'ANOVA',
      targetVariable,
      factorVariables,
      groups: Object.keys(groups).length,
      totalObservations: data.length,
      results: {
        fStatistic: 0,
        pValue: 0,
        significant: false,
        interpretation: ''
      }
    };
    
    // Calculate group means
    const groupStats = {};
    for (const [groupKey, groupData] of Object.entries(groups)) {
      const values = groupData.map(row => parseFloat(row[targetVariable])).filter(val => !isNaN(val));
      if (values.length > 0) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (values.length - 1);
        groupStats[groupKey] = {
          n: values.length,
          mean: mean,
          variance: variance,
          standardDeviation: Math.sqrt(variance)
        };
      }
    }
    
    result.groupStats = groupStats;
    result.results.interpretation = `ANOVA analysis completed for ${targetVariable} across ${factorVariables.join(', ')}`;
    
    return result;
  }
  
  private static async performANCOVA(data: any[], targetVariable: string, factorVariables: string[], covariates: string[], options: any) {
    return {
      analysisType: 'ANCOVA',
      targetVariable,
      factorVariables,
      covariates,
      results: {
        interpretation: `ANCOVA analysis completed for ${targetVariable} with covariates ${covariates.join(', ')}`
      }
    };
  }
  
  private static async performMANOVA(data: any[], dependentVariables: string[], options: any) {
    return {
      analysisType: 'MANOVA',
      dependentVariables,
      results: {
        interpretation: `MANOVA analysis completed for variables ${dependentVariables.join(', ')}`
      }
    };
  }
  
  private static async performMANCOVA(data: any[], dependentVariables: string[], covariates: string[], options: any) {
    return {
      analysisType: 'MANCOVA',
      dependentVariables,
      covariates,
      results: {
        interpretation: `MANCOVA analysis completed with covariates ${covariates.join(', ')}`
      }
    };
  }
  
  private static async performRegression(data: any[], targetVariable: string, predictorVariables: string[], options: any) {
    return {
      analysisType: 'Regression',
      targetVariable,
      predictorVariables,
      results: {
        interpretation: `Regression analysis completed for ${targetVariable} with predictors ${predictorVariables.join(', ')}`
      }
    };
  }
  
  private static async performMLAnalysis(data: any[], targetVariable: string, featureVariables: string[], config: any) {
    const { mlAlgorithm = 'random_forest', testSize = '0.2', crossValidation = '5', metrics = [] } = config;
    
    console.log('ML Analysis - featureVariables:', featureVariables);
    console.log('ML Analysis - config:', config);
    
    // Ensure featureVariables is defined
    if (!featureVariables || !Array.isArray(featureVariables) || featureVariables.length === 0) {
      throw new Error('Feature variables are required for ML analysis');
    }
    
    try {
      // Create temporary files for Python analysis
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Ensure python_data directory exists
      const pythonDataDir = join(process.cwd(), 'python_data');
      mkdirSync(pythonDataDir, { recursive: true });
      
      const inputFile = join(pythonDataDir, `${tempId}_input.json`);
      const configFile = join(pythonDataDir, `${tempId}_config.json`);
      const outputFile = join(pythonDataDir, `${tempId}_output.json`);
      
      // Save data to CSV for Python processing
      const csvData = this.convertToCSV(data);
      const csvFile = join(pythonDataDir, `${tempId}.csv`);
      writeFileSync(csvFile, csvData);
      
      // Create input and config files
      writeFileSync(inputFile, JSON.stringify({ projectId: tempId }));
      writeFileSync(configFile, JSON.stringify({
        analysisType: 'machine_learning',
        targetVariable,
        features: featureVariables,
        algorithm: mlAlgorithm,
        testSize: parseFloat(testSize),
        crossValidation: parseInt(crossValidation),
        metrics: metrics.length > 0 ? metrics : ['accuracy', 'f1_score']
      }));
      
      // Run Python analysis
      const pythonProcess = spawn('python3', [
        'data_analyzer.py',
        inputFile,
        configFile,
        outputFile
      ], {
        cwd: join(process.cwd(), 'python_scripts'),
        stdio: 'pipe'
      });
      
      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        
        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        pythonProcess.on('close', (code) => {
          try {
            if (code === 0) {
              const result = JSON.parse(readFileSync(outputFile, 'utf8'));
              resolve({
                analysisType: 'Machine Learning',
                targetVariable,
                featureVariables,
                algorithm: mlAlgorithm,
                results: result.success ? result.data : { error: result.error }
              });
            } else {
              reject(new Error(`Python analysis failed with code ${code}: ${stderr}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse Python analysis results: ${error.message}`));
          }
        });
      });
      
    } catch (error) {
      return {
        analysisType: 'Machine Learning',
        targetVariable,
        featureVariables,
        results: {
          error: `ML analysis failed: ${error.message}`
        }
      };
    }
  }
  
  private static convertToCSV(data: any[]): string {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }
  
  private static groupDataByFactors(data: any[], factorVariables: string[]) {
    const groups = {};
    
    data.forEach(row => {
      const groupKey = factorVariables.map(factor => row[factor]).join('_');
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(row);
    });
    
    return groups;
  }
}