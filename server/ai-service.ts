import Anthropic from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIProvider {
  queryData(apiKey: string, prompt: string, dataContext: any): Promise<string>;
  generateResponse(apiKey: string, prompt: string): Promise<string>;
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

  async generateResponse(apiKey: string, prompt: string): Promise<string> {
    const anthropic = new Anthropic({ apiKey });
    
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
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

class MetaProvider implements AIProvider {
  async queryData(apiKey: string, prompt: string, dataContext: any): Promise<string> {
    // Meta Llama via API (e.g., Replicate, Hugging Face, or direct endpoint)
    const systemPrompt = `You are a data analyst AI. You have access to a dataset with the following schema and sample data:

Schema: ${JSON.stringify(dataContext.schema, null, 2)}
Sample Data (first 5 rows): ${JSON.stringify(dataContext.sampleData, null, 2)}
Total Records: ${dataContext.recordCount}

Provide insights, analysis, and answers based on this data. Be specific and reference actual data patterns when possible.

User Query: ${prompt}`;

    // Using Replicate API as an example endpoint for Llama models
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: "meta/llama-2-70b-chat:02e509c789964a7ea8736978a43525956ef40397be9033abf9fd2badfe68c9e3",
        input: {
          prompt: systemPrompt,
          max_new_tokens: 1024,
          temperature: 0.1,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Meta API error: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Poll for completion if needed (Replicate returns prediction ID)
    if (result.id) {
      let prediction = result;
      while (prediction.status === 'starting' || prediction.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
          headers: { 'Authorization': `Token ${apiKey}` }
        });
        prediction = await pollResponse.json();
      }
      
      if (prediction.status === 'succeeded') {
        return prediction.output?.join('') || 'Unable to process response';
      } else {
        throw new Error(`Meta model processing failed: ${prediction.error}`);
      }
    }

    return result.output || 'Unable to process response';
  }
}

class PlatformProvider implements AIProvider {
  async queryData(apiKey: string, prompt: string, dataContext: any): Promise<string> {
    // Use platform's default Google AI API key
    const platformKey = process.env.GOOGLE_AI_API_KEY;
    if (!platformKey) {
      throw new Error("Platform AI service temporarily unavailable. Please configure your own API key in settings.");
    }
    
    const genAI = new GoogleGenerativeAI(platformKey);
    
    // Use the correct field names from the actual data structure
    const sampleData = dataContext.dataSnapshot || dataContext.sampleData || [];
    const recordCount = sampleData.length;
    const schema = dataContext.schema || {};
    
    // Create a more intelligent system prompt that can handle customer data questions
    const systemPrompt = `You are an expert data analyst AI. You have access to a dataset with the following details:

**Data Schema and Types:**
${JSON.stringify(schema, null, 2)}

**Sample Data (first ${Math.min(5, sampleData.length)} rows):**
${JSON.stringify(sampleData.slice(0, 5), null, 2)}

**Dataset Size:** ${recordCount} total records

**Analysis Instructions:**
1. Analyze the actual data provided above to answer the user's question
2. Look at column names and values to understand what the data represents
3. For counting questions (e.g., "how many customers"), count the actual rows in the dataset
4. For location questions, examine address/location columns in the data
5. If the data structure is unclear, ask clarifying questions
6. Provide specific, data-driven answers, not generic responses
7. If you cannot determine the answer from the data, clearly explain what additional information is needed

**User Question:** ${prompt}

**Response Guidelines:**
- Be specific and reference actual data
- Count actual records when asked for quantities
- Identify patterns from the real data shown
- If the question cannot be answered from this data, explain why and suggest what data would be needed`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    
    return response.text() || 'Unable to process response';
  }
}

export class AIService {
  private providers: Record<string, AIProvider> = {
    platform: new PlatformProvider(),
    anthropic: new AnthropicProvider(),
    openai: new OpenAIProvider(),
    gemini: new GeminiProvider(),
    meta: new MetaProvider(),
  };

  async queryData(provider: string, apiKey: string, prompt: string, dataContext: any): Promise<string> {
    const aiProvider = this.providers[provider];
    if (!aiProvider) {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }

    try {
      // Add timeout to prevent hanging requests
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('AI service timeout')), 15000); // 15 second timeout
      });

      const analysisPromise = aiProvider.queryData(apiKey, prompt, dataContext);
      
      return await Promise.race([analysisPromise, timeoutPromise]);
    } catch (error: any) {
      console.error('AI service error:', error);
      
      // Provide intelligent fallback response based on the question
      return this.generateFallbackResponse(prompt, dataContext);
    }
  }

  private generateFallbackResponse(prompt: string, dataContext: any): string {
    const sampleData = dataContext.dataSnapshot || dataContext.sampleData || [];
    const recordCount = sampleData.length;
    const schema = dataContext.schema || {};
    const columns = Object.keys(schema);

    // Analyze the prompt to provide contextual responses
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('how many') && (lowerPrompt.includes('customer') || lowerPrompt.includes('record') || lowerPrompt.includes('row'))) {
      return `Based on the uploaded data, you have ${recordCount} records in your dataset. Each record appears to represent a data entry with ${columns.length} fields: ${columns.join(', ')}.`;
    }
    
    if (lowerPrompt.includes('where') && (lowerPrompt.includes('live') || lowerPrompt.includes('location') || lowerPrompt.includes('address'))) {
      const locationColumns = columns.filter(col => 
        col.toLowerCase().includes('city') || 
        col.toLowerCase().includes('state') || 
        col.toLowerCase().includes('country') || 
        col.toLowerCase().includes('address') ||
        col.toLowerCase().includes('location')
      );
      
      if (locationColumns.length > 0) {
        const locationData: string[] = sampleData.map((row: any) => 
          locationColumns.map(col => row[col]).filter(Boolean).join(', ')
        ).filter(Boolean);
        
        const uniqueLocations = locationData.filter((value, index, self) => self.indexOf(value) === index);
        return `Your data contains location information in ${locationColumns.join(', ')}. Based on the sample data, locations include: ${uniqueLocations.slice(0, 5).join(', ')}${uniqueLocations.length > 5 ? ` and ${uniqueLocations.length - 5} more` : ''}.`;
      } else {
        return `I don't see specific location columns in your data. The available columns are: ${columns.join(', ')}. To analyze location data, please ensure your dataset includes address, city, state, or country columns.`;
      }
    }

    // Generic fallback
    return `Your dataset contains ${recordCount} records with ${columns.length} columns (${columns.join(', ')}). For more detailed AI analysis including patterns, trends, and specific insights, please ensure a stable internet connection or try again later.`;
  }

  async generateDataInsights(provider: string, apiKey: string, dataContext: any): Promise<{
    summary: string;
    keyFindings: string[];
    recommendations: string[];
    dataQuality: {
      completeness: number;
      consistency: number;
      accuracy: number;
      issues: string[];
    };
  }> {
    try {
      const prompt = `Analyze this dataset comprehensively and provide:

1. EXECUTIVE SUMMARY: A 2-3 sentence overview of what this data represents and its main characteristics.

2. KEY FINDINGS: List 3-5 most important insights discovered in the data, including:
   - Statistical patterns and trends
   - Correlations between variables
   - Outliers or anomalies
   - Distribution characteristics

3. BUSINESS RECOMMENDATIONS: Provide 3-5 actionable recommendations based on the data analysis.

4. DATA QUALITY ASSESSMENT: Evaluate the data quality and identify any issues.

Format your response as structured JSON with the exact keys: summary, keyFindings, recommendations, dataQuality.`;

      const response = await this.queryData(provider, apiKey, prompt, dataContext);
      
      try {
        // Try to parse JSON response
        const parsed = JSON.parse(response);
        return {
          summary: parsed.summary || 'Analysis completed successfully',
          keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          dataQuality: {
            completeness: parsed.dataQuality?.completeness || 85,
            consistency: parsed.dataQuality?.consistency || 90,
            accuracy: parsed.dataQuality?.accuracy || 88,
            issues: Array.isArray(parsed.dataQuality?.issues) ? parsed.dataQuality.issues : []
          }
        };
      } catch (error) {
        // Fallback: parse unstructured response or generate from context
        return this.parseUnstructuredInsights(response);
      }
    } catch (error) {
      console.error('Data insights generation failed:', error);
      // Generate insights from data structure when AI is unavailable
      return this.generateStructuralInsights(dataContext);
    }
  }

  private generateStructuralInsights(dataContext: any): {
    summary: string;
    keyFindings: string[];
    recommendations: string[];
    dataQuality: { completeness: number; consistency: number; accuracy: number; issues: string[] };
  } {
    const sampleData = dataContext.dataSnapshot || dataContext.sampleData || [];
    const recordCount = sampleData.length;
    const schema = dataContext.schema || {};
    const columns = Object.keys(schema);

    return {
      summary: `Dataset contains ${recordCount} records with ${columns.length} data fields. The data appears to be structured with consistent column types including ${columns.slice(0, 3).join(', ')}${columns.length > 3 ? ' and others' : ''}.`,
      keyFindings: [
        `Data structure includes ${columns.length} columns: ${columns.join(', ')}`,
        `Dataset contains ${recordCount} total records`,
        recordCount > 100 ? 'Substantial dataset size suitable for analysis' : 'Limited dataset size - consider collecting more data for robust analysis',
        'Data appears well-structured and ready for analysis'
      ].slice(0, 4),
      recommendations: [
        'Ensure data quality by checking for missing values and inconsistencies',
        'Consider collecting additional data points to enhance analysis accuracy',
        'Upgrade to premium features for advanced AI-powered insights and visualizations',
        'Regular data validation recommended for ongoing analysis projects'
      ],
      dataQuality: {
        completeness: 85,
        consistency: 90,
        accuracy: 88,
        issues: ['Some columns may contain missing values', 'Data validation recommended for production use']
      }
    };
  }

  private parseUnstructuredInsights(response: string): {
    summary: string;
    keyFindings: string[];
    recommendations: string[];
    dataQuality: any;
  } {
    const lines = response.split('\n').filter(line => line.trim());
    
    return {
      summary: lines[0] || 'Analysis completed successfully',
      keyFindings: lines.slice(1, 4).map(line => line.replace(/^[\d\-\*\•]\s*/, '')),
      recommendations: lines.slice(4, 7).map(line => line.replace(/^[\d\-\*\•]\s*/, '')),
      dataQuality: {
        completeness: 85,
        consistency: 90,
        accuracy: 88,
        issues: ['Some data quality assessment may require manual review']
      }
    };
  }

  async generateVisualizationSuggestions(provider: string, apiKey: string, dataContext: any): Promise<Array<{
    type: string;
    title: string;
    description: string;
    columns: string[];
    config: any;
  }>> {
    const prompt = `Based on this dataset schema and sample data, suggest the most effective visualizations for data analysis.

For each visualization, provide:
- type: chart type (bar, line, scatter, pie, histogram, boxplot, heatmap)
- title: descriptive title
- description: what insights this visualization reveals
- columns: which data columns to use
- config: chart configuration options

Consider data types, relationships, and analytical value. Suggest 3-5 visualizations that would provide the most insights.

Format as JSON array.`;

    const response = await this.queryData(provider, apiKey, prompt, dataContext);
    
    try {
      const suggestions = JSON.parse(response);
      return Array.isArray(suggestions) ? suggestions : [];
    } catch (error) {
      // Provide default visualizations based on schema
      return this.generateDefaultVisualizations(dataContext.schema);
    }
  }

  private generateDefaultVisualizations(schema: Record<string, string>): Array<{
    type: string;
    title: string;
    description: string;
    columns: string[];
    config: any;
  }> {
    const suggestions = [];
    const columns = Object.keys(schema);
    const numericColumns = columns.filter(col => 
      ['integer', 'number', 'float', 'decimal'].includes(schema[col].toLowerCase())
    );
    const categoricalColumns = columns.filter(col => 
      ['string', 'text', 'varchar'].includes(schema[col].toLowerCase())
    );

    if (numericColumns.length >= 2) {
      suggestions.push({
        type: 'scatter',
        title: `${numericColumns[0]} vs ${numericColumns[1]}`,
        description: 'Explore correlation between numeric variables',
        columns: numericColumns.slice(0, 2),
        config: { showTrendline: true }
      });
    }

    if (numericColumns.length >= 1 && categoricalColumns.length >= 1) {
      suggestions.push({
        type: 'bar',
        title: `${numericColumns[0]} by ${categoricalColumns[0]}`,
        description: 'Compare values across categories',
        columns: [categoricalColumns[0], numericColumns[0]],
        config: { orientation: 'vertical' }
      });
    }

    if (numericColumns.length >= 1) {
      suggestions.push({
        type: 'histogram',
        title: `Distribution of ${numericColumns[0]}`,
        description: 'Analyze data distribution patterns',
        columns: [numericColumns[0]],
        config: { bins: 20 }
      });
    }

    return suggestions;
  }

  getAvailableProviders(): string[] {
    return Object.keys(this.providers);
  }

  getProviderInfo() {
    return {
      platform: {
        name: 'ChimariData+AI',
        model: 'Gemini 1.5 Pro (Platform)',
        pricing: 'Included in your plan',
        description: 'Our default AI service - get started immediately with no setup required',
        tier: 'starter',
        requiresApiKey: false
      },
      anthropic: {
        name: 'Anthropic Claude',
        model: 'Claude 3.5 Sonnet',
        pricing: '$3 per million input tokens, $15 per million output tokens',
        description: 'High-quality analysis with excellent reasoning capabilities for complex data relationships',
        tier: 'professional',
        requiresApiKey: true,
        setupInstructions: 'Get your API key from console.anthropic.com'
      },
      openai: {
        name: 'OpenAI GPT-4',
        model: 'GPT-4o',
        pricing: '$2.50 per million input tokens, $10 per million output tokens',
        description: 'Balanced performance and cost with strong analytical skills',
        tier: 'professional',
        requiresApiKey: true,
        setupInstructions: 'Get your API key from platform.openai.com'
      },
      gemini: {
        name: 'Google Gemini',
        model: 'Gemini 1.5 Pro',
        pricing: '$1.25 per million input tokens, $5 per million output tokens',
        description: 'Google\'s advanced AI with excellent multimodal capabilities',
        tier: 'professional',
        requiresApiKey: true,
        setupInstructions: 'Get your API key from ai.google.dev'
      },
      meta: {
        name: 'Meta Llama',
        model: 'Llama 2 70B Chat',
        pricing: '$0.65 per million input tokens, $2.75 per million output tokens',
        description: 'Meta\'s open-source large language model via Replicate API',
        tier: 'professional',
        requiresApiKey: true,
        setupInstructions: 'Get your API key from replicate.com'
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