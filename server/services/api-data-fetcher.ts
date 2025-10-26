// server/services/api-data-fetcher.ts
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { promisify } from 'util';
import * as crypto from 'crypto';

const sleep = promisify(setTimeout);

/**
 * Real API Data Fetcher - Replaces mock implementation
 * Fetches data from external APIs with authentication, rate limiting, and retry logic
 */

export interface APIFetchRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  params?: Record<string, any>;
  body?: any;
  auth?: {
    type: 'bearer' | 'basic' | 'api_key';
    token?: string;
    username?: string;
    password?: string;
    apiKeyHeader?: string;
    apiKeyValue?: string;
  };
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface APIFetchResponse {
  data: any;
  status: number;
  statusText: string;
  headers: Record<string, any>;
  metadata: {
    requestTime: Date;
    responseTime: Date;
    duration: number;
    responseSize: number;
    retryCount: number;
  };
}

export class APIDataFetcher {
  private maxRetries: number = 3;
  private defaultTimeout: number = 30000; // 30 seconds
  private rateLimitDelay: number = 1000; // 1 second between requests

  /**
   * Fetch data from external API with retry logic and error handling
   */
  async fetch(request: APIFetchRequest): Promise<APIFetchResponse> {
    const startTime = new Date();
    let retryCount = 0;
    const maxRetries = request.retries ?? this.maxRetries;
    const retryDelay = request.retryDelay ?? 2000;

    // Validate URL
    this.validateURL(request.url);

    // Build axios config
    const axiosConfig: AxiosRequestConfig = {
      url: request.url,
      method: request.method || 'GET',
      headers: this.buildHeaders(request),
      params: request.params,
      data: request.body,
      timeout: request.timeout || this.defaultTimeout,
      validateStatus: () => true, // Don't throw on any status code
    };

    // Add authentication
    if (request.auth) {
      this.addAuthentication(axiosConfig, request.auth);
    }

    let lastError: Error | null = null;

    // Retry loop
    while (retryCount <= maxRetries) {
      try {
        console.log(`[APIDataFetcher] Attempting request to ${request.url} (attempt ${retryCount + 1}/${maxRetries + 1})`);

        const response: AxiosResponse = await axios(axiosConfig);
        const endTime = new Date();

        // Check for rate limiting (429 status)
        if (response.status === 429) {
          const retryAfter = response.headers['retry-after'];
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : retryDelay * Math.pow(2, retryCount);

          console.log(`[APIDataFetcher] Rate limited. Waiting ${waitTime}ms before retry`);
          await sleep(waitTime);
          retryCount++;
          continue;
        }

        // Check for server errors (5xx) that should be retried
        if (response.status >= 500 && retryCount < maxRetries) {
          console.log(`[APIDataFetcher] Server error ${response.status}. Retrying...`);
          await sleep(retryDelay * Math.pow(2, retryCount));
          retryCount++;
          continue;
        }

        // Calculate response size
        const responseSize = JSON.stringify(response.data).length;

        return {
          data: response.data,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          metadata: {
            requestTime: startTime,
            responseTime: endTime,
            duration: endTime.getTime() - startTime.getTime(),
            responseSize,
            retryCount
          }
        };

      } catch (error: any) {
        lastError = error;
        console.error(`[APIDataFetcher] Request failed (attempt ${retryCount + 1}):`, error.message);

        // Don't retry on client errors (except timeout)
        if (error.response && error.response.status >= 400 && error.response.status < 500 && error.code !== 'ECONNABORTED') {
          throw new Error(`API request failed with status ${error.response.status}: ${error.response.statusText}`);
        }

        // Retry on network errors and timeouts
        if (retryCount < maxRetries) {
          const waitTime = retryDelay * Math.pow(2, retryCount);
          console.log(`[APIDataFetcher] Waiting ${waitTime}ms before retry`);
          await sleep(waitTime);
          retryCount++;
        } else {
          break;
        }
      }
    }

    // All retries exhausted
    throw new Error(`API request failed after ${retryCount} retries: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Validate URL format and security
   */
  private validateURL(url: string): void {
    try {
      const parsed = new URL(url);

      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Invalid protocol: ${parsed.protocol}. Only HTTP and HTTPS are allowed.`);
      }

      // Block localhost and private IPs in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = parsed.hostname.toLowerCase();

        // Block localhost
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
          throw new Error('Cannot fetch from localhost in production');
        }

        // Block private IP ranges
        if (this.isPrivateIP(hostname)) {
          throw new Error('Cannot fetch from private IP addresses in production');
        }
      }

    } catch (error: any) {
      throw new Error(`Invalid URL: ${error.message}`);
    }
  }

  /**
   * Check if hostname is a private IP address
   */
  private isPrivateIP(hostname: string): boolean {
    // Simple check for common private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^fc00:/,
      /^fe80:/
    ];

    return privateRanges.some(range => range.test(hostname));
  }

  /**
   * Build request headers
   */
  private buildHeaders(request: APIFetchRequest): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'ChimariData-Platform/1.0',
      'Accept': 'application/json',
      ...request.headers
    };

    // Add Content-Type for requests with body
    if (request.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  /**
   * Add authentication to request
   */
  private addAuthentication(config: AxiosRequestConfig, auth: APIFetchRequest['auth']): void {
    if (!auth) return;

    switch (auth.type) {
      case 'bearer':
        if (!auth.token) {
          throw new Error('Bearer token is required for bearer authentication');
        }
        config.headers = {
          ...config.headers,
          'Authorization': `Bearer ${auth.token}`
        };
        break;

      case 'basic':
        if (!auth.username || !auth.password) {
          throw new Error('Username and password are required for basic authentication');
        }
        const basicAuth = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
        config.headers = {
          ...config.headers,
          'Authorization': `Basic ${basicAuth}`
        };
        break;

      case 'api_key':
        if (!auth.apiKeyHeader || !auth.apiKeyValue) {
          throw new Error('API key header and value are required for API key authentication');
        }
        config.headers = {
          ...config.headers,
          [auth.apiKeyHeader]: auth.apiKeyValue
        };
        break;

      default:
        throw new Error(`Unsupported authentication type: ${auth.type}`);
    }
  }

  /**
   * Health check - verify service is operational
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      // Test with a simple public API
      const testURL = 'https://httpbin.org/status/200';

      const result = await this.fetch({
        url: testURL,
        method: 'GET',
        timeout: 5000,
        retries: 1
      });

      return {
        healthy: result.status === 200,
        details: {
          status: 'operational',
          testURL,
          responseTime: result.metadata.duration
        }
      };
    } catch (error: any) {
      return {
        healthy: false,
        details: {
          status: 'error',
          error: error.message
        }
      };
    }
  }

  /**
   * Rate limiting helper
   */
  async enforceRateLimit(): Promise<void> {
    await sleep(this.rateLimitDelay);
  }
}

// Export singleton instance
export const apiDataFetcher = new APIDataFetcher();
