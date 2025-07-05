import { multiAIService } from './multi-ai-service';

export interface QuestionAnalysis {
  intent: {
    entity: string; // What the question is about (e.g., "employees", "customers", "products")
    action: string; // What they want to know (e.g., "count", "location", "performance")
    specificity: "high" | "medium" | "low"; // How specific/clear the question is
  };
  dataRelevance: {
    hasMatchingEntities: boolean;
    relevantColumns: string[];
    confidence: number;
    suggestedReframe?: string;
  };
  needsAIProcessing: boolean;
  clarificationNeeded: boolean;
}

export class QuestionAnalyzer {
  /**
   * Analyzes a question to understand intent and data relevance
   */
  async analyzeQuestion(
    question: string, 
    dataSchema: Record<string, string>,
    dataSample?: any[]
  ): Promise<QuestionAnalysis> {
    try {
      // Use AI to understand question intent
      const intentAnalysis = await this.analyzeQuestionIntent(question);
      
      // Assess if question matches available data
      const dataRelevance = await this.assessDataRelevance(
        intentAnalysis, 
        Object.keys(dataSchema), 
        dataSample
      );
      
      // Determine processing requirements
      const needsAIProcessing = this.shouldUseAIProcessing(intentAnalysis, dataRelevance);
      const clarificationNeeded = !dataRelevance.hasMatchingEntities && dataRelevance.confidence < 0.5;
      
      return {
        intent: intentAnalysis,
        dataRelevance,
        needsAIProcessing,
        clarificationNeeded
      };
    } catch (error) {
      console.error("Question analysis failed:", error);
      
      // Return basic fallback analysis
      const fallbackIntent = this.getIntentFromKeywords(question.toLowerCase());
      const relevantColumns = this.findRelevantColumns(fallbackIntent, Object.keys(dataSchema));
      
      return {
        intent: fallbackIntent,
        dataRelevance: {
          hasMatchingEntities: relevantColumns.length > 0,
          relevantColumns,
          confidence: relevantColumns.length > 0 ? 0.7 : 0.3
        },
        needsAIProcessing: true,
        clarificationNeeded: relevantColumns.length === 0
      };
    }
  }

  /**
   * Analyzes question intent using AI or keyword fallback
   */
  private async analyzeQuestionIntent(question: string): Promise<QuestionAnalysis['intent']> {
    const prompt = `Analyze this data question for intent:
"${question}"

Return JSON with:
{
  "entity": "what the question is about (e.g., employees, customers, products)",
  "action": "what they want to know (e.g., count, location, performance)", 
  "specificity": "high/medium/low"
}

Examples:
- "How many employees?" → {"entity": "employees", "action": "count", "specificity": "high"}
- "Where do customers live?" → {"entity": "customers", "action": "location", "specificity": "medium"}`;

    try {
      const dataContext = {
        schema: {},
        dataSnapshot: [],
        recordCount: 0,
        metadata: {}
      };
      
      const response = await multiAIService.analyzeQuestion(prompt, dataContext);
      
      try {
        const analysis = JSON.parse(response);
        return {
          entity: analysis.entity || "unknown",
          action: analysis.action || "query",
          specificity: analysis.specificity || "medium"
        };
      } catch (parseError) {
        // If response isn't JSON, use fallback
        return this.getIntentFromKeywords(question.toLowerCase());
      }
    } catch (error) {
      console.error("Intent analysis failed:", error);
      return this.getIntentFromKeywords(question.toLowerCase());
    }
  }

  private getIntentFromKeywords(questionLower: string): QuestionAnalysis['intent'] {
    let entity = "data";
    let action = "query";
    let specificity: "high" | "medium" | "low" = "medium";

    // Simple entity detection
    if (questionLower.includes('customer') || questionLower.includes('client')) entity = "customers";
    else if (questionLower.includes('employee') || questionLower.includes('staff')) entity = "employees";
    else if (questionLower.includes('product') || questionLower.includes('item')) entity = "products";
    else if (questionLower.includes('sale') || questionLower.includes('revenue')) entity = "sales";

    // Simple action detection
    if (questionLower.includes('how many') || questionLower.includes('count')) action = "count";
    else if (questionLower.includes('where') || questionLower.includes('location')) action = "location";
    else if (questionLower.includes('performance') || questionLower.includes('trend')) action = "performance";

    // Simple specificity assessment
    if (questionLower.split(' ').length <= 3) specificity = "high";
    else if (questionLower.split(' ').length > 8) specificity = "low";

    return { entity, action, specificity };
  }

  /**
   * Assesses if the question is relevant to available data
   */
  private async assessDataRelevance(
    intent: QuestionAnalysis['intent'],
    columns: string[],
    dataSample?: any[]
  ): Promise<QuestionAnalysis['dataRelevance']> {
    const prompt = `Question asks about "${intent.entity}" with action "${intent.action}".
Available data columns: ${columns.join(', ')}
Sample data: ${dataSample ? JSON.stringify(dataSample.slice(0, 3)) : 'Not available'}

Return JSON with:
{
  "hasMatchingEntities": true/false,
  "relevantColumns": ["list", "of", "relevant", "columns"],
  "confidence": 0.0-1.0,
  "suggestedReframe": "optional suggestion if question doesn't match data"
}

Examples:
- If asking about "employees" but data contains "customers": hasMatchingEntities: false, suggestedReframe: "This appears to be customer data. Did you mean to ask about customers?"
- If asking about "location" and data has address columns: hasMatchingEntities: true, relevantColumns: ["address", "city", "state"]`;

    try {
      const dataContext = {
        schema: Object.fromEntries(columns.map(col => [col, 'unknown'])),
        dataSnapshot: dataSample || [],
        recordCount: dataSample?.length || 0,
        metadata: {}
      };
      
      const response = await multiAIService.analyzeQuestion(prompt, dataContext);
      
      try {
        const analysis = JSON.parse(response);
        return {
          hasMatchingEntities: analysis.hasMatchingEntities || false,
          relevantColumns: analysis.relevantColumns || [],
          confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
          suggestedReframe: analysis.suggestedReframe
        };
      } catch (parseError) {
        // If response isn't JSON, try to extract relevant info
        const relevantColumns = this.findRelevantColumns(intent, columns);
        return {
          hasMatchingEntities: relevantColumns.length > 0,
          relevantColumns,
          confidence: relevantColumns.length > 0 ? 0.7 : 0.3
        };
      }
    } catch (error) {
      console.error("Data relevance analysis failed:", error);
      
      // Fallback: basic column matching
      const relevantColumns = this.findRelevantColumns(intent, columns);
      return {
        hasMatchingEntities: relevantColumns.length > 0,
        relevantColumns,
        confidence: relevantColumns.length > 0 ? 0.7 : 0.3
      };
    }
  }

  /**
   * Determines if AI processing is needed for complex questions
   */
  private shouldUseAIProcessing(
    intent: QuestionAnalysis['intent'], 
    dataRelevance: QuestionAnalysis['dataRelevance']
  ): boolean {
    // Use AI processing if:
    // 1. Question is vague or complex
    // 2. Low confidence in data matching
    // 3. Question specificity is low
    return (
      intent.specificity === "low" ||
      dataRelevance.confidence < 0.6 ||
      !dataRelevance.hasMatchingEntities
    );
  }

  /**
   * Simple column matching based on keywords
   */
  private findRelevantColumns(
    intent: QuestionAnalysis['intent'], 
    columns: string[]
  ): string[] {
    const entity = intent.entity.toLowerCase();
    const action = intent.action.toLowerCase();
    const relevant: string[] = [];

    for (const column of columns) {
      const columnLower = column.toLowerCase();
      
      // Entity matching
      if (entity.includes('customer') && 
          (columnLower.includes('customer') || columnLower.includes('client'))) {
        relevant.push(column);
      }
      if (entity.includes('employee') && 
          (columnLower.includes('employee') || columnLower.includes('staff'))) {
        relevant.push(column);
      }
      if (entity.includes('product') && 
          (columnLower.includes('product') || columnLower.includes('item'))) {
        relevant.push(column);
      }
      
      // Action matching
      if (action.includes('location') && 
          (columnLower.includes('address') || columnLower.includes('city') || 
           columnLower.includes('state') || columnLower.includes('location'))) {
        relevant.push(column);
      }
      if (action.includes('count') && 
          (columnLower.includes('id') || columnLower.includes('count'))) {
        relevant.push(column);
      }
    }

    return Array.from(new Set(relevant)); // Remove duplicates
  }
}

export const questionAnalyzer = new QuestionAnalyzer();