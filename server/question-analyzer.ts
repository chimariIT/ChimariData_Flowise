import { aiService } from "./ai-service";

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
      
      // Check data relevance
      const dataRelevance = await this.assessDataRelevance(
        intentAnalysis, 
        dataSchema, 
        dataSample
      );
      
      // Determine processing needs
      const needsAIProcessing = this.shouldUseAIProcessing(intentAnalysis, dataRelevance);
      const clarificationNeeded = this.needsClarification(dataRelevance);
      
      return {
        intent: intentAnalysis,
        dataRelevance,
        needsAIProcessing,
        clarificationNeeded
      };
    } catch (error) {
      console.error("Question analysis failed:", error);
      // Return safe defaults for analysis failure
      return {
        intent: {
          entity: "data",
          action: "analyze",
          specificity: "low"
        },
        dataRelevance: {
          hasMatchingEntities: false,
          relevantColumns: [],
          confidence: 0.3
        },
        needsAIProcessing: true,
        clarificationNeeded: true
      };
    }
  }

  /**
   * Uses AI to understand what the user is asking about
   */
  private async analyzeQuestionIntent(question: string): Promise<QuestionAnalysis['intent']> {
    const prompt = `Analyze this data question and extract key information:

Question: "${question}"

Return JSON with:
{
  "entity": "what the question is about (e.g., employees, customers, products, sales, campaigns)",
  "action": "what they want to know (e.g., count, location, performance, demographics, trends)",
  "specificity": "high|medium|low based on how clear and specific the question is"
}

Examples:
- "How many employees do I have?" → {"entity": "employees", "action": "count", "specificity": "high"}
- "Where do customers live?" → {"entity": "customers", "action": "location", "specificity": "high"}
- "What's the performance?" → {"entity": "unknown", "action": "performance", "specificity": "low"}`;

    const response = await aiService.generateResponse(prompt);
    
    try {
      return JSON.parse(response);
    } catch {
      // Fallback parsing
      const entity = this.extractEntity(question);
      const action = this.extractAction(question);
      return {
        entity,
        action,
        specificity: entity !== "unknown" && action !== "analyze" ? "medium" : "low"
      };
    }
  }

  /**
   * Assesses if the question matches the available data
   */
  private async assessDataRelevance(
    intent: QuestionAnalysis['intent'],
    dataSchema: Record<string, string>,
    dataSample?: any[]
  ): Promise<QuestionAnalysis['dataRelevance']> {
    const columns = Object.keys(dataSchema);
    const columnNames = columns.join(", ");
    
    // Get sample values for context
    const sampleContext = dataSample ? 
      `Sample data values: ${JSON.stringify(dataSample.slice(0, 3))}` : "";

    const prompt = `Analyze if this question matches the available data:

Question Intent:
- Entity: ${intent.entity}
- Action: ${intent.action}

Available Data:
- Columns: ${columnNames}
- Schema: ${JSON.stringify(dataSchema, null, 2)}
${sampleContext}

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
      const response = await aiService.generateResponse(prompt);
      const analysis = JSON.parse(response);
      
      return {
        hasMatchingEntities: analysis.hasMatchingEntities || false,
        relevantColumns: analysis.relevantColumns || [],
        confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
        suggestedReframe: analysis.suggestedReframe
      };
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
   * Determines if clarification is needed before processing
   */
  private needsClarification(dataRelevance: QuestionAnalysis['dataRelevance']): boolean {
    return !dataRelevance.hasMatchingEntities && dataRelevance.confidence < 0.5;
  }

  /**
   * Fallback entity extraction from question text
   */
  private extractEntity(question: string): string {
    const entities = [
      'employees', 'staff', 'workers', 'team',
      'customers', 'clients', 'users', 'buyers',
      'products', 'items', 'goods', 'services',
      'sales', 'revenue', 'profit', 'income',
      'campaigns', 'ads', 'marketing', 'promotions'
    ];
    
    const lowerQuestion = question.toLowerCase();
    for (const entity of entities) {
      if (lowerQuestion.includes(entity)) {
        return entity;
      }
    }
    return "unknown";
  }

  /**
   * Fallback action extraction from question text
   */
  private extractAction(question: string): string {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('how many') || lowerQuestion.includes('count')) return 'count';
    if (lowerQuestion.includes('where') || lowerQuestion.includes('location')) return 'location';
    if (lowerQuestion.includes('performance') || lowerQuestion.includes('metrics')) return 'performance';
    if (lowerQuestion.includes('average') || lowerQuestion.includes('mean')) return 'average';
    if (lowerQuestion.includes('total') || lowerQuestion.includes('sum')) return 'total';
    
    return 'analyze';
  }

  /**
   * Fallback column matching logic
   */
  private findRelevantColumns(intent: QuestionAnalysis['intent'], columns: string[]): string[] {
    const relevant: string[] = [];
    const lowerColumns = columns.map(c => c.toLowerCase());
    
    // Match entity to column names
    const entityKeywords = {
      'employees': ['employee', 'staff', 'worker', 'team'],
      'customers': ['customer', 'client', 'user', 'buyer'],
      'location': ['address', 'city', 'state', 'country', 'location', 'zip'],
      'performance': ['performance', 'conversion', 'roi', 'engagement', 'score'],
      'campaigns': ['campaign', 'ad', 'marketing', 'promotion']
    };

    const keywords = entityKeywords[intent.entity as keyof typeof entityKeywords] || [intent.entity];
    
    for (let i = 0; i < columns.length; i++) {
      const column = lowerColumns[i];
      if (keywords.some(keyword => column.includes(keyword))) {
        relevant.push(columns[i]);
      }
    }
    
    return relevant;
  }
}

export const questionAnalyzer = new QuestionAnalyzer();