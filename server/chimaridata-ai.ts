import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface AIProvider {
  name: string;
  generateInsights(data: any, prompt: string): Promise<string>;
  isAvailable(): boolean;
}

export class ChimaridataAI {
  private providers: AIProvider[] = [];
  private currentProviderIndex = 0;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Gemini provider (primary) - check both GOOGLE_AI_API_KEY and legacy GEMINI_API_KEY
    const googleApiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (googleApiKey) {
      this.providers.push(new GeminiProvider(googleApiKey));
    }

    // OpenAI provider (fallback 1)
    if (process.env.OPENAI_API_KEY) {
      this.providers.push(new OpenAIProvider(process.env.OPENAI_API_KEY));
    }

    // OpenRouter provider (fallback 2 - OpenAI-compatible aggregator)
    if (process.env.OPENROUTER_API_KEY) {
      this.providers.push(new OpenRouterProvider(process.env.OPENROUTER_API_KEY));
    }

    // Anthropic provider (fallback 3)
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.push(new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
    }

    // Together provider (fallback 4 - open-source model gateway)
    if (process.env.TOGETHER_API_KEY) {
      this.providers.push(new TogetherProvider(process.env.TOGETHER_API_KEY));
    }

    // Groq provider (fallback 5 - fast Llama/Mixtral inference)
    if (process.env.GROQ_API_KEY) {
      this.providers.push(new GroqProvider(process.env.GROQ_API_KEY));
    }

    // Mock provider (final fallback - always available if others fail)
    if (this.providers.length === 0) {
      this.providers.push(new MockProvider());
    }

    console.log(`Initialized ${this.providers.length} AI providers`);
  }

  async generateInsights(data: any, context: string = "general", customPrompt?: string): Promise<{
    success: boolean;
    insights: string;
    provider: string;
    error?: string;
  }> {
    const prompt = customPrompt || this.buildPrompt(data, context);

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];

      try {
        if (!provider.isAvailable()) {
          console.log(`Provider ${provider.name} is not available, skipping...`);
          continue;
        }

        console.log(`Attempting insights generation with ${provider.name}...`);
        // Add per-provider timeout to prevent a single slow API from stalling the entire chain
        const PROVIDER_TIMEOUT_MS = 25000;
        const insightsPromise = provider.generateInsights(data, prompt);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Provider ${provider.name} timed out after ${PROVIDER_TIMEOUT_MS / 1000}s`)), PROVIDER_TIMEOUT_MS)
        );
        const insights = await Promise.race([insightsPromise, timeoutPromise]);

        return {
          success: true,
          insights,
          provider: provider.name
        };
      } catch (error: any) {
        console.error(`Provider ${provider.name} failed:`, error.message);

        // If this is the last provider, return the error
        if (i === this.providers.length - 1) {
          return {
            success: false,
            insights: "",
            provider: provider.name,
            error: error.message
          };
        }
      }
    }

    return {
      success: false,
      insights: "",
      provider: "none",
      error: "No AI providers available"
    };
  }

  /**
   * Generate generic text based on a prompt (e.g. for translation or summarization)
   * Bypasses the dataset analysis prompt structure
   */
  async generateText(params: {
    prompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string; provider: string }> {
    const { prompt, maxTokens, temperature } = params;

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];

      try {
        if (!provider.isAvailable()) {
          continue;
        }

        // Use the provider's generateInsights method but treat it as raw text generation
        // Most providers implement generateInsights by just sending the prompt if data is empty/ignored
        // But we need to check implementation.
        // Actually, looking at the providers:
        // Gemini: uses result.response.text()
        // OpenAI: uses completion.choices[0].message.content
        // Anthropic: uses response.content[0].text
        // All of them take `prompt` as 2nd arg.
        // We can pass null/empty object as data and the full prompt as prompt.

        // HOWEVER, generateInsights signature in providers is (data: any, prompt: string).

        // Let's modify providers to support a more direct generation or generic method.
        // For now, to avoid changing all providers, we can reuse generateInsights 
        // passing empty data and our prompt.

        // Add per-provider timeout to prevent a single slow API from stalling the entire chain
        const PROVIDER_TIMEOUT_MS = 25000; // 25s per provider — allows failover to next
        const textPromise = provider.generateInsights({}, prompt);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Provider ${provider.name} timed out after ${PROVIDER_TIMEOUT_MS / 1000}s`)), PROVIDER_TIMEOUT_MS)
        );
        const text = await Promise.race([textPromise, timeoutPromise]);

        return {
          text,
          provider: provider.name
        };
      } catch (error: any) {
        console.error(`Provider ${provider.name} failed text generation:`, error.message);
        if (i === this.providers.length - 1) {
          throw new Error(`Text generation failed: ${error.message}`);
        }
      }
    }

    throw new Error("No AI providers available for text generation");
  }

  private buildPrompt(data: any, context: string): string {
    const basePrompt = `You are an expert data analyst. Analyze the following dataset and provide actionable insights.

Dataset Information:
- Records: ${data.recordCount || 'Unknown'}
- Columns: ${data.schema ? Object.keys(data.schema).length : 'Unknown'}
- Context: ${context}

Schema:
${data.schema ? JSON.stringify(data.schema, null, 2) : 'Schema not available'}

Please provide:
1. Key patterns and trends in the data
2. Data quality assessment
3. Business insights and recommendations
4. Potential areas for further investigation
5. Actionable next steps

Focus on practical, business-relevant insights that can drive decision-making.`;

    return basePrompt;
  }

  // Add custom provider (for user's own API keys)
  addCustomProvider(provider: AIProvider) {
    this.providers.unshift(provider); // Add to beginning for priority
  }

  getAvailableProviders(): string[] {
    return this.providers
      .filter(p => p.isAvailable())
      .map(p => p.name);
  }
}

class GeminiProvider implements AIProvider {
  public name = "Gemini";
  private client: GoogleGenerativeAI;

  constructor(private apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateInsights(data: any, prompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const response = result.response;
    return response.text();
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

class OpenAIProvider implements AIProvider {
  public name = "OpenAI";
  private client: OpenAI;

  constructor(private apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateInsights(data: any, prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert data analyst. Provide clear, actionable insights based on the data provided."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    return response.choices[0].message.content || "No insights generated";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

class AnthropicProvider implements AIProvider {
  public name = "Anthropic";
  private client: Anthropic;

  constructor(private apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateInsights(data: any, prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    return response.content[0].type === 'text' ? response.content[0].text : "No insights generated";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

class OpenRouterProvider implements AIProvider {
  public name = 'OpenRouter';
  private client: OpenAI;

  constructor(private apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    });
  }

  async generateInsights(data: any, prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: process.env.OPENROUTER_LLM_MODEL || 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert data analyst. Provide clear, actionable insights based on the data provided.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    return response.choices[0].message.content || 'No insights generated';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

class TogetherProvider implements AIProvider {
  public name = 'Together';
  private client: OpenAI;

  constructor(private apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1',
    });
  }

  async generateInsights(data: any, prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: process.env.TOGETHER_LLM_MODEL || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an expert data analyst. Provide clear, actionable insights based on the data provided.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    return response.choices[0].message.content || 'No insights generated';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

class GroqProvider implements AIProvider {
  public name = "Groq";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateInsights(data: any, prompt: string): Promise<string> {
    // Groq uses OpenAI-compatible API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert data analyst. Provide clear, actionable insights based on the data provided.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || 'No insights generated';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

class MockProvider implements AIProvider {
  public name = "Mock (No API Keys)";

  async generateInsights(data: any, prompt: string): Promise<string> {
    return JSON.stringify({
      summary: "System is running in offline mode. Please configure AI API keys to generate real insights.",
      highlights: [
        { title: "Configuration Required", description: "No AI provider API keys found in environment variables.", type: "warning", confidence: 1.0 },
        { title: "Data Overview", description: `Dataset contains ${data.recordCount || 'unknown'} records.`, type: "info", confidence: 1.0 }
      ],
      recommendations: ["Add one of GOOGLE_AI_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, TOGETHER_API_KEY, or GROQ_API_KEY to .env file"],
      nextSteps: ["Configure API keys", "Restart server"],
      warnings: ["AI features are currently disabled"]
    });
  }

  isAvailable(): boolean {
    return true;
  }
}

export const chimaridataAI = new ChimaridataAI();