/**
 * Survey Data Preprocessor Service
 *
 * Wraps the Python survey_preprocessor.py script to detect and transform
 * survey-type datasets. Integrates with the existing data pipeline.
 *
 * Two modes:
 * - detect: Analyze dataset structure (question columns, Likert patterns, metadata)
 * - transform: Apply preprocessing (rename to topics, encode Likert, etc.)
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ---- Type Definitions ----

export interface SurveyDetectionResult {
  success: boolean;
  is_survey: boolean;
  confidence: number;
  n_columns: number;
  n_rows: number;
  question_columns: SurveyQuestionColumn[];
  metadata_columns: SurveyMetadataColumn[];
  grouping_columns: string[];
  recommended_transformations: SurveyTransformationRecommendation[];
  summary: {
    question_count: number;
    metadata_count: number;
    grouping_count: number;
    likert_count: number;
    free_text_count: number;
    numeric_count: number;
  };
  error?: string;
}

export interface SurveyQuestionColumn {
  original_name: string;
  topic_label: string | null;
  response_type: string | null;
  likert_encoding?: Record<string, number>;
  unique_values?: string[];
  is_question: boolean;
}

export interface SurveyMetadataColumn {
  original_name: string;
  detected_type: string;
  n_unique: number;
}

export interface SurveyTransformationRecommendation {
  type: 'rename_to_topics' | 'encode_likert' | 'create_topic_groups';
  description: string;
  priority: 'high' | 'medium' | 'low';
  affected_columns?: number;
}

export interface SurveyTransformation {
  type: 'rename_to_topics' | 'encode_likert' | 'create_topic_groups';
  columns?: string[];
}

export interface SurveyTransformResult {
  success: boolean;
  transformed_data: any[];
  column_mapping: Record<string, string>;
  encoded_columns: Array<{
    column: string;
    original_column: string;
    encoding: Record<string, number>;
    n_encoded: number;
    n_missing: number;
  }>;
  question_lookup: Array<{
    question_id: string;
    original_question: string;
    topic_label: string;
    response_type?: string;
    encoding?: Record<string, number>;
  }>;
  n_renamed: number;
  n_encoded: number;
  n_rows: number;
  n_columns: number;
  new_columns: string[];
  error?: string;
}

// ---- Service ----

export class SurveyPreprocessor {
  private scriptsPath: string;

  constructor() {
    this.scriptsPath = path.join(process.cwd(), 'python');
  }

  /**
   * Detect whether a dataset has survey structure.
   * Takes raw dataset rows and returns detection results.
   */
  async detectSurveyStructure(rows: any[]): Promise<SurveyDetectionResult> {
    if (!rows || rows.length === 0) {
      return {
        success: false,
        is_survey: false,
        confidence: 0,
        n_columns: 0,
        n_rows: 0,
        question_columns: [],
        metadata_columns: [],
        grouping_columns: [],
        recommended_transformations: [],
        summary: { question_count: 0, metadata_count: 0, grouping_count: 0, likert_count: 0, free_text_count: 0, numeric_count: 0 },
        error: 'No data rows provided'
      };
    }

    // Write data to temp file
    const tempDataPath = path.join(os.tmpdir(), `survey_detect_${Date.now()}.json`);
    try {
      fs.writeFileSync(tempDataPath, JSON.stringify(rows));

      const result = await this.executePythonScript({
        data_path: tempDataPath,
        mode: 'detect'
      });

      return result as SurveyDetectionResult;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempDataPath)) {
        fs.unlinkSync(tempDataPath);
      }
    }
  }

  /**
   * Apply survey-specific transformations to dataset rows.
   * Returns transformed data with column mappings and encoding info.
   */
  async applySurveyTransformations(
    rows: any[],
    transformations: SurveyTransformation[]
  ): Promise<SurveyTransformResult> {
    if (!rows || rows.length === 0) {
      return {
        success: false,
        transformed_data: [],
        column_mapping: {},
        encoded_columns: [],
        question_lookup: [],
        n_renamed: 0,
        n_encoded: 0,
        n_rows: 0,
        n_columns: 0,
        new_columns: [],
        error: 'No data rows provided'
      };
    }

    const tempDataPath = path.join(os.tmpdir(), `survey_transform_${Date.now()}.json`);
    try {
      fs.writeFileSync(tempDataPath, JSON.stringify(rows));

      const result = await this.executePythonScript({
        data_path: tempDataPath,
        mode: 'transform',
        transformations
      });

      return result as SurveyTransformResult;
    } finally {
      if (fs.existsSync(tempDataPath)) {
        fs.unlinkSync(tempDataPath);
      }
    }
  }

  /**
   * Quick check if column names suggest a survey dataset.
   * Uses heuristics without calling Python (fast path).
   */
  quickDetectSurvey(columnNames: string[]): { likely: boolean; confidence: number; questionColumns: string[] } {
    const questionColumns: string[] = [];

    for (const col of columnNames) {
      const isLong = col.length > 40;
      const hasQuestionMark = col.includes('?');
      const hasQuestionWords = /\b(how|what|which|please|rank|rate|do you|would you|should|select|describe|to what extent)\b/i.test(col);

      if (isLong || hasQuestionMark || (hasQuestionWords && col.length > 20)) {
        questionColumns.push(col);
      }
    }

    const ratio = questionColumns.length / columnNames.length;
    const likely = questionColumns.length >= 3 && ratio > 0.3;
    const confidence = Math.min(0.95, ratio * 1.2 + (questionColumns.length >= 5 ? 0.15 : 0));

    return { likely, confidence, questionColumns };
  }

  // ---- Private methods ----

  private executePythonScript(config: any): Promise<any> {
    return new Promise((resolve) => {
      const scriptPath = path.join(this.scriptsPath, 'survey_preprocessor.py');

      if (!fs.existsSync(scriptPath)) {
        console.warn(`⚠️ [SurveyPreprocessor] Script not found: ${scriptPath}`);
        resolve({ success: false, error: 'survey_preprocessor.py not found' });
        return;
      }

      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const configJson = JSON.stringify(config);

      const pythonProcess = spawn(pythonCmd, [scriptPath], {
        env: { ...process.env, CONFIG: configJson },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      // Timeout: 60 seconds for preprocessing
      const timeout = setTimeout(() => {
        pythonProcess.kill();
        resolve({ success: false, error: 'Survey preprocessing timed out (60s)' });
      }, 60000);

      pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
      pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          try {
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              resolve(JSON.parse(jsonMatch[0]));
            } else {
              resolve({ success: true, output: stdout });
            }
          } catch (e) {
            resolve({ success: false, error: `Failed to parse output: ${stdout.substring(0, 200)}` });
          }
        } else {
          console.error(`❌ [SurveyPreprocessor] Script failed:`, stderr);
          resolve({ success: false, error: stderr || `Script exited with code ${code}` });
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`❌ [SurveyPreprocessor] Process error:`, error);
        resolve({ success: false, error: error.message });
      });

      // Send config via stdin as backup
      pythonProcess.stdin.write(configJson);
      pythonProcess.stdin.end();
    });
  }
}

// Singleton instance
let _instance: SurveyPreprocessor | null = null;

export function getSurveyPreprocessor(): SurveyPreprocessor {
  if (!_instance) {
    _instance = new SurveyPreprocessor();
  }
  return _instance;
}
