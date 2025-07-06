import { GoogleGenAI } from "@google/genai";
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from "openai";

interface AIProvider {
  name: string;
  analyze: (question: string, dataContext: any) => Promise<string>;
  isAvailable: () => boolean;
}

class MultiAIService {
  private providers: AIProvider[] = [];

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // 1. Gemini Provider (Primary) - ChimariData Default
    if (process.env.GEMINI_API_KEY) {
      const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      this.providers.push({
        name: 'Gemini',
        isAvailable: () => !!process.env.GEMINI_API_KEY,
        analyze: async (question: string, dataContext: any) => {
          const prompt = this.buildAnalysisPrompt(question, dataContext);
          const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });
          return response.text || "Unable to analyze with Gemini";
        }
      });
    }

    // 2. OpenAI Provider (Secondary fallback)
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      this.providers.push({
        name: 'OpenAI',
        isAvailable: () => !!process.env.OPENAI_API_KEY,
        analyze: async (question: string, dataContext: any) => {
          const prompt = this.buildAnalysisPrompt(question, dataContext);
          const response = await openai.chat.completions.create({
            model: "gpt-4o", // Latest OpenAI model
            messages: [{ role: "user", content: prompt }],
            max_tokens: 2000,
          });
          return response.choices[0].message.content || "Unable to analyze with OpenAI";
        }
      });
    }

    // 3. Anthropic Provider (Third fallback)  
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      
      this.providers.push({
        name: 'Anthropic',
        isAvailable: () => !!process.env.ANTHROPIC_API_KEY,
        analyze: async (question: string, dataContext: any) => {
          const prompt = this.buildAnalysisPrompt(question, dataContext);
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514", // Latest Anthropic model
            max_tokens: 2000,
            messages: [{ role: "user", content: prompt }],
          });
          return response.content[0].type === 'text' ? response.content[0].text : "Unable to analyze with Anthropic";
        }
      });
    }

    console.log(`Initialized AI providers: ${this.providers.map(p => p.name).join(', ')}`);
  }

  private buildAnalysisPrompt(question: string, dataContext: any): string {
    const { schema, dataSnapshot, metadata, recordCount } = dataContext;
    
    return `You are a data analyst helping users understand their dataset. Answer the user's question based on the actual data provided.

DATASET CONTEXT:
- Total Records: ${recordCount || 'Unknown'}
- Schema: ${JSON.stringify(schema, null, 2)}
- Sample Data: ${JSON.stringify(dataSnapshot?.slice(0, 5) || [], null, 2)}

USER QUESTION: ${question}

Please provide a comprehensive analysis addressing the question. Include:
1. Direct answer to the question
2. Key insights from the data
3. Relevant statistics or patterns
4. Actionable recommendations if applicable

Format your response clearly with headers and bullet points for readability.`;
  }

  // Main analysis method with try-catch fallback: Gemini → OpenAI → Anthropic
  async analyzeWithFallback(question: string, dataContext: any): Promise<{ result: string; provider: string }> {
    const errors: string[] = [];
    
    // Try each provider in order
    for (const provider of this.providers) {
      if (!provider.isAvailable()) {
        continue;
      }

      try {
        console.log(`Attempting analysis with ${provider.name}...`);
        const result = await provider.analyze(question, dataContext);
        console.log(`Successfully analyzed with ${provider.name}`);
        return { result, provider: provider.name };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`${provider.name} analysis failed:`, errorMessage);
        errors.push(`${provider.name}: ${errorMessage}`);
        continue;
      }
    }

    // All providers failed
    throw new Error(`All AI providers failed. Errors: ${errors.join('; ')}`);
  }

  // Method for custom user API keys
  async analyzeWithCustomKeys(
    question: string, 
    dataContext: any,
    customKeys: { geminiApiKey?: string; anthropicApiKey?: string; openaiApiKey?: string }
  ): Promise<{ result: string; provider: string }> {
    const errors: string[] = [];

    // Try Gemini with custom key first
    if (customKeys.geminiApiKey) {
      try {
        const gemini = new GoogleGenAI({ apiKey: customKeys.geminiApiKey });
        const prompt = this.buildAnalysisPrompt(question, dataContext);
        const response = await gemini.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
        });
        const result = response.text || "Unable to analyze with custom Gemini";
        return { result, provider: "Gemini (Custom)" };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Custom Gemini: ${errorMessage}`);
      }
    }

    // Try OpenAI with custom key
    if (customKeys.openaiApiKey) {
      try {
        const openai = new OpenAI({ apiKey: customKeys.openaiApiKey });
        const prompt = this.buildAnalysisPrompt(question, dataContext);
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2000,
        });
        const result = response.choices[0].message.content || "Unable to analyze with custom OpenAI";
        return { result, provider: "OpenAI (Custom)" };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Custom OpenAI: ${errorMessage}`);
      }
    }

    // Try Anthropic with custom key
    if (customKeys.anthropicApiKey) {
      try {
        const anthropic = new Anthropic({ apiKey: customKeys.anthropicApiKey });
        const prompt = this.buildAnalysisPrompt(question, dataContext);
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        });
        const result = response.content[0].type === 'text' ? response.content[0].text : "Unable to analyze with custom Anthropic";
        return { result, provider: "Anthropic (Custom)" };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Custom Anthropic: ${errorMessage}`);
      }
    }

    // Fall back to ChimariData defaults if custom keys fail
    console.log("Custom keys failed, falling back to ChimariData defaults...");
    return this.analyzeWithFallback(question, dataContext);
  }

  // Helper method to generate column summaries
  async generateColumnSummaries(data: any[]): Promise<Record<string, string>> {
    if (!data || data.length === 0) return {};

    // Use the first available provider for column analysis
    const firstProvider = this.providers.find(p => p.isAvailable());
    if (!firstProvider) {
      throw new Error("No AI providers available for column analysis");
    }

    try {
      const sampleData = data.slice(0, 10);
      const columns = Object.keys(data[0] || {});
      const summaries: Record<string, string> = {};

      for (const column of columns) {
        const columnData = sampleData.map((row: any) => row[column]).filter(val => val !== null && val !== undefined);
        
        if (columnData.length === 0) {
          summaries[column] = "Empty column";
          continue;
        }

        const prompt = `Analyze this data column and provide a brief summary (max 50 words):
Column Name: ${column}
Sample Values: ${JSON.stringify(columnData.slice(0, 10))}

Describe: data type, range/patterns, and key characteristics.`;

        const result = await firstProvider.analyze(prompt, { schema: {}, dataSnapshot: [], recordCount: 0 });
        summaries[column] = result.substring(0, 200); // Limit summary length
      }

      return summaries;
    } catch (error: unknown) {
      console.error("Column summary generation failed:", error);
      return {};
    }
  }

  getAvailableProviders(): string[] {
    return this.providers.filter(p => p.isAvailable()).map(p => p.name);
  }
}

export const multiAIService = new MultiAIService();