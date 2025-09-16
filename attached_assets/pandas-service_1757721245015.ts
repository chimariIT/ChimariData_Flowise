import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

export interface PandasAnalysisResult {
  answer: string;
  details: any;
  analysis_type: string;
  error?: string;
}

export class PandasAnalysisService {
  private static readonly PYTHON_SCRIPT = 'server/pandas-analyzer.py';
  private static readonly TIMEOUT_MS = 30000; // 30 second timeout

  /**
   * Analyze data using Python pandas for intelligent question answering
   */
  static async analyzeQuestion(filePath: string, question: string): Promise<PandasAnalysisResult> {
    return new Promise((resolve, reject) => {
      // Validate inputs
      if (!fs.existsSync(filePath)) {
        return resolve({
          answer: "File not found for analysis.",
          details: { error: "File path invalid" },
          analysis_type: "error",
          error: "File not found"
        });
      }

      if (!question || question.trim().length === 0) {
        return resolve({
          answer: "Please provide a question for analysis.",
          details: { error: "Empty question" },
          analysis_type: "error",
          error: "Empty question"
        });
      }

      // Spawn Python process
      const pythonProcess = spawn('python3', [
        this.PYTHON_SCRIPT,
        filePath,
        question.trim()
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.TIMEOUT_MS
      });

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
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            console.error('Failed to parse Python analysis result:', parseError);
            resolve({
              answer: "Analysis completed but results could not be parsed.",
              details: { stdout, stderr },
              analysis_type: "error",
              error: "Parse error"
            });
          }
        } else {
          console.error('Python analysis failed:', stderr);
          resolve({
            answer: "Analysis could not be completed due to processing error.",
            details: { code, stderr },
            analysis_type: "error",
            error: "Python process failed"
          });
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('Python process error:', error);
        resolve({
          answer: "Analysis service unavailable. Please try again later.",
          details: { error: error.message },
          analysis_type: "error",
          error: "Process spawn failed"
        });
      });

      // Timeout handling
      setTimeout(() => {
        pythonProcess.kill('SIGTERM');
        resolve({
          answer: "Analysis timed out. Please try with a smaller dataset or simpler question.",
          details: { error: "Timeout" },
          analysis_type: "error",
          error: "Timeout"
        });
      }, this.TIMEOUT_MS);
    });
  }

  /**
   * Test if pandas analysis service is available
   */
  static async testService(): Promise<boolean> {
    try {
      // Create a small test CSV
      const testCsv = 'name,age,city\nJohn,25,NYC\nJane,30,LA';
      const testFile = '/tmp/test_pandas.csv';
      fs.writeFileSync(testFile, testCsv);

      const result = await this.analyzeQuestion(testFile, 'How many records?');
      
      // Clean up test file
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }

      return result.analysis_type !== 'error';
    } catch (error) {
      console.error('Pandas service test failed:', error);
      return false;
    }
  }

  /**
   * Get available analysis capabilities
   */
  static getCapabilities(): string[] {
    return [
      'Record counting and data size analysis',
      'Location-based analysis and geographic insights',
      'Demographic breakdown and segmentation',
      'Performance metrics and statistical analysis',
      'Top performers and ranking analysis',
      'General dataset summaries and overviews'
    ];
  }
}