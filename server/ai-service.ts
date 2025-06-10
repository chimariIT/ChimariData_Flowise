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

class PlatformProvider implements AIProvider {
  async queryData(apiKey: string, prompt: string, dataContext: any): Promise<string> {
    // Use platform's default API key (if available)
    const platformKey = process.env.ANTHROPIC_API_KEY;
    if (!platformKey) {
      throw new Error("Platform AI service temporarily unavailable. Please configure your own API key in settings.");
    }
    
    const anthropic = new Anthropic({ apiKey: platformKey });
    
    const systemPrompt = `You are a data analyst AI provided by DataInsight Pro. You have access to a dataset with the following schema and sample data:

Schema: ${JSON.stringify(dataContext.schema, null, 2)}
Sample Data (first 5 rows): ${JSON.stringify(dataContext.sampleData, null, 2)}
Total Records: ${dataContext.recordCount}

Provide insights, analysis, and answers based on this data. Be specific and reference actual data patterns when possible. Keep responses concise and actionable.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].type === 'text' ? response.content[0].text : 'Unable to process response';
  }
}

export class AIService {
  private providers: Record<string, AIProvider> = {
    platform: new PlatformProvider(),
    anthropic: new AnthropicProvider(),
    openai: new OpenAIProvider(),
    gemini: new GeminiProvider(),
  };

  async queryData(provider: string, apiKey: string, prompt: string, dataContext: any): Promise<string> {
    const aiProvider = this.providers[provider];
    if (!aiProvider) {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }

    // For platform provider, apiKey parameter is ignored (uses platform credentials)
    return await aiProvider.queryData(apiKey, prompt, dataContext);
  }

  getAvailableProviders(): string[] {
    return Object.keys(this.providers);
  }

  getProviderInfo() {
    return {
      platform: {
        name: 'DataInsight Pro AI',
        model: 'Claude 3.5 Sonnet (Platform)',
        pricing: 'Included in your plan',
        description: 'Our default AI service - get started immediately with no setup required',
        tier: 'starter'
      },
      anthropic: {
        name: 'Anthropic Claude',
        model: 'Claude 3.5 Sonnet',
        pricing: '$3 per million input tokens, $15 per million output tokens',
        description: 'High-quality analysis with excellent reasoning capabilities',
        tier: 'professional'
      },
      openai: {
        name: 'OpenAI GPT-4o',
        model: 'GPT-4o',
        pricing: '$2.50 per million input tokens, $10 per million output tokens',
        description: 'Balanced performance and cost with strong analytical skills',
        tier: 'professional'
      },
      gemini: {
        name: 'Google Gemini',
        model: 'Gemini 1.5 Pro',
        pricing: '$3.50 per million input tokens, $10.50 per million output tokens',
        description: 'Google\'s advanced model with multimodal capabilities',
        tier: 'professional'
      }
    };
  }

  getSubscriptionTiers() {
    return {
      starter: {
        name: 'Starter',
        price: 'Free',
        features: [
          '50 AI queries per month',
          'Platform AI service included',
          'Basic data visualizations',
          'CSV/JSON/Excel upload',
          'Community support'
        ],
        limitations: [
          'Cannot use custom AI providers',
          'Limited to 50 queries monthly',
          'Basic export options'
        ]
      },
      professional: {
        name: 'Professional',
        price: '$29/month',
        features: [
          '500 AI queries per month',
          'All AI providers (Anthropic, OpenAI, Gemini)',
          'Advanced visualizations',
          'Custom API integrations',
          'Priority support',
          'Advanced export options'
        ],
        limitations: [
          'Requires your own AI API keys'
        ]
      },
      enterprise: {
        name: 'Enterprise',
        price: 'Custom pricing',
        features: [
          'Unlimited AI queries',
          'Dedicated AI infrastructure',
          'Custom model fine-tuning',
          'On-premise deployment',
          'SLA guarantees',
          'Dedicated support'
        ],
        limitations: []
      }
    };
  }
}

export const aiService = new AIService();