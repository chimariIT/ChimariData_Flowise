import Anthropic from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIProvider {
  queryData(apiKey: string, prompt: string, dataContext: any): Promise<string>;
}

class AnthropicProvider implements AIProvider {
  async queryData(apiKey: string, prompt: string, dataContext: any): Promise<string> {
    const anthropic = new Anthropic({ apiKey });
    
    const systemPrompt = `You are a data analyst AI. You have access to a dataset with the following schema and sample data:

Schema: ${JSON.stringify(dataContext.schema, null, 2)}
Sample Data (first 5 rows): ${JSON.stringify(dataContext.sampleData, null, 2)}
Total Records: ${dataContext.recordCount}

Provide insights, analysis, and answers based on this data. Be specific and reference actual data patterns when possible.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].type === 'text' ? response.content[0].text : 'Unable to process response';
  }
}

class OpenAIProvider implements AIProvider {
  async queryData(apiKey: string, prompt: string, dataContext: any): Promise<string> {
    const openai = new OpenAI({ apiKey });
    
    const systemPrompt = `You are a data analyst AI. You have access to a dataset with the following schema and sample data:

Schema: ${JSON.stringify(dataContext.schema, null, 2)}
Sample Data (first 5 rows): ${JSON.stringify(dataContext.sampleData, null, 2)}
Total Records: ${dataContext.recordCount}

Provide insights, analysis, and answers based on this data. Be specific and reference actual data patterns when possible.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
    });

    return response.choices[0]?.message?.content || 'Unable to process response';
  }
}

class GeminiProvider implements AIProvider {
  async queryData(apiKey: string, prompt: string, dataContext: any): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    const systemPrompt = `You are a data analyst AI. You have access to a dataset with the following schema and sample data:

Schema: ${JSON.stringify(dataContext.schema, null, 2)}
Sample Data (first 5 rows): ${JSON.stringify(dataContext.sampleData, null, 2)}
Total Records: ${dataContext.recordCount}

Provide insights, analysis, and answers based on this data. Be specific and reference actual data patterns when possible.

User Query: ${prompt}`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    return response.text();
  }
}

export class AIService {
  private providers: Record<string, AIProvider> = {
    anthropic: new AnthropicProvider(),
    openai: new OpenAIProvider(),
    gemini: new GeminiProvider(),
  };

  async queryData(provider: string, apiKey: string, prompt: string, dataContext: any): Promise<string> {
    const aiProvider = this.providers[provider];
    if (!aiProvider) {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }

    return await aiProvider.queryData(apiKey, prompt, dataContext);
  }

  getAvailableProviders(): string[] {
    return Object.keys(this.providers);
  }

  getProviderInfo() {
    return {
      anthropic: {
        name: 'Anthropic Claude',
        model: 'Claude 3.5 Sonnet',
        pricing: '$3 per million input tokens, $15 per million output tokens',
        description: 'High-quality analysis with excellent reasoning capabilities'
      },
      openai: {
        name: 'OpenAI GPT-4o',
        model: 'GPT-4o',
        pricing: '$2.50 per million input tokens, $10 per million output tokens',
        description: 'Balanced performance and cost with strong analytical skills'
      },
      gemini: {
        name: 'Google Gemini',
        model: 'Gemini 1.5 Pro',
        pricing: '$3.50 per million input tokens, $10.50 per million output tokens',
        description: 'Google\'s advanced model with multimodal capabilities'
      }
    };
  }
}

export const aiService = new AIService();