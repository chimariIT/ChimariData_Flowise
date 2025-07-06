import { multiAIService } from './multi-ai-service';

export interface QuestionAnalysisResult {
  entity: string;
  confidence: number;
  suggestedColumns: string[];
  analysisType: string;
  complexity: 'simple' | 'medium' | 'complex';
  dataRequirements: string[];
}

export interface EntityMatchingResult {
  hasMatchingEntities: boolean;
  relevantColumns: string[];
  matchingScore: number;
  suggestions: string[];
}

export class QuestionAnalyzer {
  
  async analyzeQuestion(question: string, columns: string[] = []): Promise<QuestionAnalysisResult> {
    try {
      const prompt = `Analyze this business question for data analysis:
Question: "${question}"
Available columns: ${columns.join(', ')}

Provide a JSON response with:
{
  "entity": "primary entity type (e.g., customers, products, sales)",
  "confidence": 0.9,
  "suggestedColumns": ["relevant column names"],
  "analysisType": "descriptive/predictive/diagnostic",
  "complexity": "simple/medium/complex",
  "dataRequirements": ["specific data needs"]
}`;

      const dataContext = {
        columns,
        dataSnapshot: [],
        recordCount: 0,
        metadata: {}
      };
      
      const aiResult = await multiAIService.analyzeWithFallback(prompt, dataContext);
      const response = aiResult.result;
      
      try {
        const analysis = JSON.parse(response);
        return {
          entity: analysis.entity || "unknown",
          confidence: analysis.confidence || 0.5,
          suggestedColumns: analysis.suggestedColumns || [],
          analysisType: analysis.analysisType || "descriptive",
          complexity: analysis.complexity || "medium",
          dataRequirements: analysis.dataRequirements || []
        };
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        return {
          entity: "unknown",
          confidence: 0.3,
          suggestedColumns: [],
          analysisType: "descriptive",
          complexity: "medium",
          dataRequirements: []
        };
      }
    } catch (error) {
      console.error('Question analysis failed:', error);
      return {
        entity: "unknown",
        confidence: 0.1,
        suggestedColumns: [],
        analysisType: "descriptive",
        complexity: "medium",
        dataRequirements: []
      };
    }
  }

  async checkEntityMatching(
    questions: string[],
    dataSample: any[]
  ): Promise<EntityMatchingResult> {
    try {
      const prompt = `Analyze if these business questions can be answered with the provided data sample:

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Data sample columns: ${Object.keys(dataSample[0] || {}).join(', ')}
Sample data: ${JSON.stringify(dataSample.slice(0, 3))}

Provide a JSON response with:
{
  "hasMatchingEntities": true/false,
  "relevantColumns": ["column names that match the questions"],
  "matchingScore": 0.8,
  "suggestions": ["recommendations for better analysis"]
}`;

      const dataContext = {
        columns: Object.keys(dataSample[0] || {}),
        dataSnapshot: dataSample.slice(0, 5),
        recordCount: dataSample?.length || 0,
        metadata: {}
      };
      
      const aiResult = await multiAIService.analyzeWithFallback(prompt, dataContext);
      const response = aiResult.result;
      
      try {
        const analysis = JSON.parse(response);
        return {
          hasMatchingEntities: analysis.hasMatchingEntities || false,
          relevantColumns: analysis.relevantColumns || [],
          matchingScore: analysis.matchingScore || 0.5,
          suggestions: analysis.suggestions || []
        };
      } catch (parseError) {
        console.error('Failed to parse entity matching response:', parseError);
        return {
          hasMatchingEntities: false,
          relevantColumns: [],
          matchingScore: 0.3,
          suggestions: ['Unable to analyze data compatibility']
        };
      }
    } catch (error) {
      console.error('Entity matching failed:', error);
      return {
        hasMatchingEntities: false,
        relevantColumns: [],
        matchingScore: 0.1,
        suggestions: ['Analysis service temporarily unavailable']
      };
    }
  }
}

export const questionAnalyzer = new QuestionAnalyzer();