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
    // Google Gemini Provider
    if (process.env.GOOGLE_AI_API_KEY) {
      const gemini = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
      
      this.providers.push({
        name: 'Gemini',
        isAvailable: () => !!process.env.GOOGLE_AI_API_KEY,
        analyze: async (question: string, dataContext: any) => {
          try {
            const prompt = this.buildAnalysisPrompt(question, dataContext);
            const response = await gemini.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
            });
            return response.text || "Unable to analyze with Gemini";
          } catch (error) {
            console.error('Gemini analysis error:', error);
            throw error;
          }
        }
      });
    }

    // Anthropic Claude Provider
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      
      this.providers.push({
        name: 'Anthropic',
        isAvailable: () => !!process.env.ANTHROPIC_API_KEY,
        analyze: async (question: string, dataContext: any) => {
          try {
            const prompt = this.buildAnalysisPrompt(question, dataContext);
            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 1024,
              messages: [{ role: 'user', content: prompt }],
            });
            return response.content[0].type === 'text' ? response.content[0].text : "Unable to analyze with Anthropic";
          } catch (error) {
            console.error('Anthropic analysis error:', error);
            throw error;
          }
        }
      });
    }

    // OpenAI Provider
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      this.providers.push({
        name: 'OpenAI',
        isAvailable: () => !!process.env.OPENAI_API_KEY,
        analyze: async (question: string, dataContext: any) => {
          try {
            const prompt = this.buildAnalysisPrompt(question, dataContext);
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 1024,
            });
            return response.choices[0].message.content || "Unable to analyze with OpenAI";
          } catch (error) {
            console.error('OpenAI analysis error:', error);
            throw error;
          }
        }
      });
    }

    console.log(`Initialized AI providers: ${this.providers.map(p => p.name).join(', ')}`);
  }

  private buildAnalysisPrompt(question: string, dataContext: any): string {
    const { schema, dataSnapshot, metadata, recordCount } = dataContext;
    
    return `You are a data analyst helping users understand their dataset. Answer the user's question based on the actual data provided.

Dataset Information:
- Records: ${recordCount}
- Columns: ${Object.keys(schema).join(', ')}
- Schema: ${JSON.stringify(schema, null, 2)}
- Sample Data: ${JSON.stringify(dataSnapshot.slice(0, 5), null, 2)}

User Question: "${question}"

Instructions:
1. Analyze the question in relation to the actual data structure and content
2. If the question asks about entities not present in the data, clearly state what data is actually available
3. Provide specific, factual answers based on the sample data when possible
4. For counting questions, use the sample data to estimate totals
5. Be concise but informative
6. If the question cannot be answered with the available data, suggest alternative questions

Answer:`;
  }

  async analyzeQuestion(question: string, dataContext: any): Promise<string> {
    if (this.providers.length === 0) {
      return this.getFallbackAnalysis(question, dataContext);
    }

    // Try each provider in order until one succeeds
    for (const provider of this.providers) {
      if (!provider.isAvailable()) continue;
      
      try {
        console.log(`Attempting analysis with ${provider.name}...`);
        const result = await provider.analyze(question, dataContext);
        console.log(`Successfully analyzed with ${provider.name}`);
        return result;
      } catch (error) {
        console.error(`${provider.name} failed:`, error.message);
        continue;
      }
    }

    // If all providers fail, use intelligent fallback
    console.log('All AI providers failed, using intelligent fallback analysis');
    return this.getFallbackAnalysis(question, dataContext);
  }

  private getFallbackAnalysis(question: string, dataContext: any): string {
    const { schema, dataSnapshot, recordCount } = dataContext;
    const questionLower = question.toLowerCase();
    const columns = Object.keys(schema);
    
    // Count-related questions
    if (questionLower.includes('how many')) {
      if (questionLower.includes('record') || questionLower.includes('row')) {
        return `Your dataset contains ${recordCount} records in total.`;
      }
      
      // Look for specific entity counts
      const sampleData = dataSnapshot.slice(0, 50);
      
      if (questionLower.includes('campaign')) {
        const campaignCol = columns.find(col => col.toLowerCase().includes('campaign'));
        if (campaignCol) {
          const uniqueValues = new Set(sampleData.map(row => row[campaignCol]).filter(val => val));
          return `Based on the sample data, you have approximately ${uniqueValues.size} unique campaigns in the ${campaignCol} column.`;
        }
      }
      
      if (questionLower.includes('customer') || questionLower.includes('user')) {
        const customerCol = columns.find(col => 
          col.toLowerCase().includes('customer') || 
          col.toLowerCase().includes('user') ||
          col.toLowerCase().includes('id')
        );
        if (customerCol) {
          const uniqueValues = new Set(sampleData.map(row => row[customerCol]).filter(val => val));
          return `Based on the sample data, you have approximately ${uniqueValues.size} unique entries in the ${customerCol} column.`;
        }
      }
      
      return `Your dataset contains ${recordCount} total records. Available data fields: ${columns.join(', ')}.`;
    }

    // Location-related questions
    if (questionLower.includes('where') || questionLower.includes('location') || questionLower.includes('live')) {
      const locationCols = columns.filter(col => 
        col.toLowerCase().includes('location') ||
        col.toLowerCase().includes('address') ||
        col.toLowerCase().includes('city') ||
        col.toLowerCase().includes('region') ||
        col.toLowerCase().includes('country')
      );
      
      if (locationCols.length > 0) {
        const sampleData = dataSnapshot.slice(0, 20);
        const locations = new Set();
        
        locationCols.forEach(col => {
          sampleData.forEach(row => {
            if (row[col] && row[col] !== '') {
              locations.add(row[col]);
            }
          });
        });
        
        if (locations.size > 0) {
          const locationList = Array.from(locations).slice(0, 10).join(', ');
          return `Based on your data, locations include: ${locationList}. Location data found in columns: ${locationCols.join(', ')}.`;
        }
      }
      
      return `No specific location data detected in the available columns: ${columns.join(', ')}.`;
    }

    // Performance/metrics questions
    if (questionLower.includes('performance') || questionLower.includes('revenue') || questionLower.includes('sales')) {
      const metricCols = columns.filter(col => 
        col.toLowerCase().includes('revenue') ||
        col.toLowerCase().includes('sales') ||
        col.toLowerCase().includes('amount') ||
        col.toLowerCase().includes('value') ||
        col.toLowerCase().includes('price')
      );
      
      if (metricCols.length > 0) {
        return `Your dataset contains performance metrics in columns: ${metricCols.join(', ')}. You have ${recordCount} records for analysis.`;
      }
    }

    // Generic response
    return `Your dataset contains ${recordCount} records with ${columns.length} data fields: ${columns.join(', ')}. For specific analysis, please ask questions about the available data fields.`;
  }

  getAvailableProviders(): string[] {
    return this.providers.filter(p => p.isAvailable()).map(p => p.name);
  }

  hasAnyProvider(): boolean {
    return this.providers.some(p => p.isAvailable());
  }
}

export const multiAIService = new MultiAIService();