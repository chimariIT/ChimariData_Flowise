/**
 * Web Search Service
 *
 * Provides real web search and scraping capabilities via Firecrawl API.
 * Used by:
 * 1. Template Research Agent — finding industry-specific KPI/metric definitions
 * 2. Business Definition Registry — fallback when AI inference returns low confidence
 * 3. Agent tool handler — replacing the stub handleWebResearch()
 *
 * Features:
 * - Search for KPI/metric definitions with industry context
 * - Scrape specific URLs for structured data
 * - In-memory cache with configurable TTL
 * - Graceful degradation when FIRECRAWL_API_KEY is not set
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
  source: string;
  publishedDate?: Date;
}

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  markdown: string;
  metadata?: Record<string, any>;
}

export interface DefinitionResult {
  found: boolean;
  kpiName: string;
  definition?: string;
  formula?: string;
  alternativeNames?: string[];
  industry?: string;
  source?: string;
  sourceUrl?: string;
  confidence: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class WebSearchService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  private readonly MAX_CACHE_SIZE = 500;

  /**
   * Check if Firecrawl is configured
   */
  isAvailable(): boolean {
    return !!process.env.FIRECRAWL_API_KEY;
  }

  /**
   * Search for KPI/metric definitions with industry context
   */
  async searchDefinitions(
    query: string,
    context?: { industry?: string; maxResults?: number }
  ): Promise<SearchResult[]> {
    if (!this.isAvailable()) {
      console.warn('⚠️ [WebSearch] FIRECRAWL_API_KEY not configured, returning empty results');
      return [];
    }

    const cacheKey = `search:${query}:${context?.industry || ''}`;
    const cached = this.getFromCache<SearchResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const apiKey = process.env.FIRECRAWL_API_KEY!;
      const searchQuery = context?.industry
        ? `${query} KPI definition ${context.industry} industry`
        : `${query} KPI metric definition formula`;

      const response = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: context?.maxResults || 5,
          scrapeOptions: {
            formats: ['markdown'],
            onlyMainContent: true
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firecrawl search error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const results: SearchResult[] = (data.data || []).map((item: any, idx: number) => ({
        title: item.metadata?.title || item.title || 'Untitled',
        url: item.url || item.metadata?.sourceURL || '',
        snippet: this.extractSnippet(item.markdown || item.content || '', query),
        relevanceScore: 1 - (idx * 0.1), // Firecrawl returns in relevance order
        source: 'firecrawl',
        publishedDate: item.metadata?.publishedDate ? new Date(item.metadata.publishedDate) : undefined
      }));

      this.setCache(cacheKey, results);
      console.log(`🔍 [WebSearch] Found ${results.length} results for "${query}"`);
      return results;
    } catch (error: any) {
      console.error(`❌ [WebSearch] Search failed for "${query}":`, error.message);
      return [];
    }
  }

  /**
   * Scrape a specific URL for structured data
   */
  async scrapeUrl(
    url: string,
    options?: { extractSchema?: object }
  ): Promise<ScrapedContent | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const cacheKey = `scrape:${url}`;
    const cached = this.getFromCache<ScrapedContent>(cacheKey);
    if (cached) return cached;

    try {
      const apiKey = process.env.FIRECRAWL_API_KEY!;

      const body: any = {
        url,
        formats: ['markdown'],
        onlyMainContent: true
      };

      if (options?.extractSchema) {
        body.extract = {
          schema: options.extractSchema
        };
      }

      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firecrawl scrape error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const result: ScrapedContent = {
        url,
        title: data.data?.metadata?.title || 'Untitled',
        content: data.data?.content || '',
        markdown: data.data?.markdown || '',
        metadata: data.data?.metadata
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error: any) {
      console.error(`❌ [WebSearch] Scrape failed for "${url}":`, error.message);
      return null;
    }
  }

  /**
   * Search with extraction — finds pages AND extracts structured KPI/metric definitions.
   * This is the primary method used by business-definition-registry and required-data-elements-tool.
   */
  async searchAndExtract(
    kpiName: string,
    industry: string
  ): Promise<DefinitionResult> {
    const cacheKey = `extract:${kpiName}:${industry}`;
    const cached = this.getFromCache<DefinitionResult>(cacheKey);
    if (cached) return cached;

    if (!this.isAvailable()) {
      return { found: false, kpiName, confidence: 0 };
    }

    try {
      // Step 1: Search for the KPI definition
      const searchResults = await this.searchDefinitions(kpiName, {
        industry,
        maxResults: 3
      });

      if (searchResults.length === 0) {
        return { found: false, kpiName, confidence: 0 };
      }

      // Step 2: Extract definition from the top result's content
      const topResult = searchResults[0];

      // Try to parse the definition from the snippet/content
      const definition = this.extractDefinitionFromText(topResult.snippet, kpiName);
      const formula = this.extractFormulaFromText(topResult.snippet, kpiName);
      const alternativeNames = this.extractAlternativeNames(topResult.snippet, kpiName);

      const result: DefinitionResult = {
        found: !!definition,
        kpiName,
        definition: definition || undefined,
        formula: formula || undefined,
        alternativeNames: alternativeNames.length > 0 ? alternativeNames : undefined,
        industry,
        source: topResult.title,
        sourceUrl: topResult.url,
        confidence: definition ? 0.7 : 0.3
      };

      this.setCache(cacheKey, result);
      console.log(`📖 [WebSearch] ${result.found ? 'Found' : 'Partial'} definition for "${kpiName}": ${definition?.slice(0, 80)}...`);
      return result;
    } catch (error: any) {
      console.error(`❌ [WebSearch] searchAndExtract failed for "${kpiName}":`, error.message);
      return { found: false, kpiName, confidence: 0 };
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private extractSnippet(text: string, query: string): string {
    if (!text) return '';

    // Find the most relevant paragraph containing query terms
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20);

    let bestParagraph = paragraphs[0] || text.slice(0, 500);
    let bestScore = 0;

    for (const para of paragraphs) {
      const paraLower = para.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (paraLower.includes(term)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestParagraph = para;
      }
    }

    // Truncate to reasonable length
    return bestParagraph.slice(0, 500).trim();
  }

  private extractDefinitionFromText(text: string, kpiName: string): string | null {
    if (!text) return null;

    const textLower = text.toLowerCase();
    const kpiLower = kpiName.toLowerCase();

    // Look for patterns like "X is defined as...", "X measures...", "X is..."
    const definitionPatterns = [
      new RegExp(`${kpiLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(?:is\\s+)?(?:defined\\s+as|measures|refers\\s+to|represents|is\\s+a)\\s+([^.]+\\.?)`, 'i'),
      new RegExp(`(?:definition|what\\s+is).*?${kpiLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?[:.]\\s*([^.]+\\.?)`, 'i'),
    ];

    for (const pattern of definitionPatterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].length > 20) {
        return match[1].trim();
      }
    }

    // Fallback: return the first sentence that mentions the KPI
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(kpiLower)) {
        return sentence.trim() + '.';
      }
    }

    return null;
  }

  private extractFormulaFromText(text: string, kpiName: string): string | null {
    if (!text) return null;

    // Look for formula patterns
    const formulaPatterns = [
      /formula[:\s]+([^.\n]+)/i,
      /calculated\s+(?:as|by)[:\s]+([^.\n]+)/i,
      /=\s*([A-Za-z_][\w\s+\-*/()]+)/,
      /(?:sum|average|mean|count|ratio)\s*\([^)]+\)/i,
    ];

    for (const pattern of formulaPatterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].length > 5) {
        return match[1].trim();
      }
      if (match && match[0] && match[0].length > 5) {
        return match[0].trim();
      }
    }

    return null;
  }

  private extractAlternativeNames(text: string, kpiName: string): string[] {
    if (!text) return [];

    const alternatives: string[] = [];

    // Look for "also known as", "also called", "abbreviated as"
    const akaPatterns = [
      /also\s+(?:known|called|referred\s+to)\s+as\s+([^,.]+)/gi,
      /abbreviated\s+(?:as|to)\s+([A-Z][A-Z0-9]+)/gi,
      /\(([A-Z][A-Z0-9]+)\)/g,  // Abbreviations in parentheses
    ];

    for (const pattern of akaPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const alt = match[1]?.trim();
        if (alt && alt.toLowerCase() !== kpiName.toLowerCase() && alt.length > 1) {
          alternatives.push(alt);
        }
      }
    }

    return [...new Set(alternatives)].slice(0, 5);
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache<T>(key: string, data: T): void {
    // Evict oldest entries if cache is too large
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear the entire cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
export const webSearchService = new WebSearchService();

// Log availability on startup
{
  if (process.env.FIRECRAWL_API_KEY) {
    console.log('🔍 [WebSearch] Firecrawl web search enabled');
  } else {
    console.log('ℹ️ [WebSearch] FIRECRAWL_API_KEY not set — web search disabled (definitions will use AI inference only)');
  }
}
