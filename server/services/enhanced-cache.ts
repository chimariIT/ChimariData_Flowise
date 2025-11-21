/**
 * Enhanced Redis Caching Service
 * 
 * Provides intelligent caching for AI responses, database queries, and computed results.
 * Includes cache invalidation strategies, TTL management, and performance monitoring.
 * 
 * Features:
 * - Multi-layer caching (L1 memory, L2 Redis)
 * - Intelligent cache keys with versioning
 * - Automatic cache invalidation
 * - Cache warming and prefetching
 * - Performance metrics and monitoring
 * - Compression for large payloads
 * - Cache tags for bulk invalidation
 */

import Redis from 'ioredis';
import LRUCache from 'lru-cache';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { createHash } from 'crypto';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface CacheEntry<T = any> {
  data: T;
  metadata: {
    createdAt: number;
    lastAccessed: number;
    accessCount: number;
    tags?: string[];
    compressed?: boolean;
    originalSize?: number;
    compressedSize?: number;
  };
}

type SerializedCacheEntry<T> = {
  data: T | string;
  metadata: CacheEntry<T>['metadata'];
};

export interface CacheOptions {
  ttl?: number;           // Time to live in seconds
  tags?: string[];        // Tags for bulk invalidation
  compress?: boolean;     // Compress large payloads
  l1Cache?: boolean;      // Use L1 memory cache
  warmup?: boolean;       // Pre-warm cache on miss
  version?: string;       // Cache version for invalidation
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  memoryUsage: number;
  l1CacheSize: number;
  l2CacheSize: number;
  averageResponseTime: number;
  compressionRatio: number;
}

export class EnhancedCacheService {
  private redis: Redis | null = null;
  private redisEnabled: boolean = false;
  private l1Cache: LRUCache<string, CacheEntry>;
  private metrics: CacheMetrics;
  private defaultTTL: number = 3600; // 1 hour
  private compressionThreshold: number = 1024; // 1KB
  private keyPrefix: string = 'chimari:cache:';
  private metricsInterval: NodeJS.Timeout | null = null;
  private readonly l1CacheMaxEntries = 1000;
  private readonly l1CacheMaxBytes = 50 * 1024 * 1024; // 50MB

  constructor(redisConfig?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  }) {
    // Only connect to Redis if explicitly enabled or in production
    const shouldConnectRedis = process.env.NODE_ENV === 'production' || process.env.REDIS_ENABLED === 'true';

    if (shouldConnectRedis) {
      // Initialize Redis connection
      this.redis = new Redis({
        host: redisConfig?.host || process.env.REDIS_HOST || 'localhost',
        port: redisConfig?.port || parseInt(process.env.REDIS_PORT || '6379'),
        password: redisConfig?.password || process.env.REDIS_PASSWORD,
        db: redisConfig?.db || parseInt(process.env.REDIS_DB || '0'),
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        retryStrategy(times) {
          if (times > 3) {
            console.warn('Enhanced Cache Service: Redis connection failed after 3 retries, using L1 cache only');
            return null; // Stop retrying
          }
          return Math.min(times * 50, 2000);
        }
      });

      this.setupEventHandlers();

      // Try to connect
      this.redis.connect()
        .then(() => {
          this.redisEnabled = true;
          console.log('✅ Enhanced Cache Service: Connected to Redis (L1 + L2 caching)');
        })
        .catch((error) => {
          console.warn('⚠️  Enhanced Cache Service: Redis not available, using L1 cache only');
          this.redisEnabled = false;
        });
    } else {
      console.log('⚠️  Enhanced Cache Service: Running with L1 cache only (Redis disabled in development)');
    }

    // Initialize L1 cache (in-memory)
    const l1CacheConfig: any = {
      max: this.l1CacheMaxEntries,
      maxSize: this.l1CacheMaxBytes,
      ttl: 300000,            // 5 minutes TTL (used by lru-cache >=7)
      sizeCalculation: (value: CacheEntry) => {
        return JSON.stringify(value).length;
      },
      dispose: () => {
        this.metrics.evictions++;
      }
    };

    // Provide backward compatibility for lru-cache versions that expect maxAge
    l1CacheConfig.maxAge = 300000;

    this.l1Cache = new LRUCache(l1CacheConfig as any);

    this.metrics = this.initializeMetrics();
    this.startMetricsCollection();
  }

  private initializeMetrics(): CacheMetrics {
    return {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      memoryUsage: 0,
      l1CacheSize: 0,
      l2CacheSize: 0,
      averageResponseTime: 0,
      compressionRatio: 0
    };
  }

  private setupEventHandlers(): void {
    if (!this.redis) return;

    this.redis.on('connect', () => {
      console.log('✅ Enhanced Cache Service: Connected to Redis');
      this.redisEnabled = true;
    });

    this.redis.on('error', (error) => {
      // Don't log errors, just silently disable Redis
      this.redisEnabled = false;
    });

    this.redis.on('ready', () => {
      console.log('✅ Enhanced Cache Service: Redis ready');
      this.redisEnabled = true;
    });
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 30000); // Update every 30 seconds
  }

  private async updateMetrics(): Promise<void> {
    try {
      // Update hit rate
      const total = this.metrics.hits + this.metrics.misses;
      this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;

      // Update L1 cache size
      this.metrics.l1CacheSize = this.l1Cache.size;

      // Update memory usage (rough estimate)
      this.metrics.memoryUsage = this.l1Cache.calculatedSize || 0;

      // Get Redis memory info (only if enabled)
      const redis = this.redis;
      if (redis && this.redisEnabled) {
        try {
          const redisInfo = await redis.info('memory');
          const memoryMatch = redisInfo.match(/used_memory:(\d+)/);
          if (memoryMatch) {
            this.metrics.l2CacheSize = parseInt(memoryMatch[1]);
          }
        } catch (error) {
          // Redis not available, skip L2 metrics
          this.metrics.l2CacheSize = 0;
        }
      }
    } catch (error) {
      // Silently fail metrics update
    }
  }

  /**
   * Generate cache key with hashing for long keys
   */
  private generateCacheKey(key: string, version?: string): string {
    const versionSuffix = version ? `:v${version}` : '';
    const fullKey = `${this.keyPrefix}${key}${versionSuffix}`;
    
    // Hash long keys to prevent Redis key length issues
    if (fullKey.length > 250) {
      const hash = createHash('sha256').update(fullKey).digest('hex');
      return `${this.keyPrefix}hash:${hash}`;
    }
    
    return fullKey;
  }

  /**
   * Get value from cache with multi-layer lookup
   */
  async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(key, options.version);

    try {
      // L1 Cache lookup first
      if (options.l1Cache !== false) {
        const l1Entry = this.l1Cache.get(cacheKey);
        if (l1Entry) {
          l1Entry.metadata.lastAccessed = Date.now();
          l1Entry.metadata.accessCount++;
          this.metrics.hits++;
          console.debug(`Cache hit (L1): ${key}`);
          return l1Entry.data;
        }
      }

      // L2 Cache (Redis) lookup (only if enabled)
      const redis = this.redis;
      if (redis && this.redisEnabled) {
        try {
          const redisData = await redis.get(cacheKey);
          if (redisData) {
            let entry: CacheEntry<T>;

            try {
              const parsed: SerializedCacheEntry<T> = JSON.parse(redisData);

              const metadata = {
                ...parsed.metadata,
                lastAccessed: Date.now(),
                accessCount: (parsed.metadata?.accessCount || 0) + 1
              };

              if (parsed.metadata?.compressed) {
                const dataToDecompress = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data);
                const decompressed = await gunzipAsync(Buffer.from(dataToDecompress, 'base64'));
                entry = {
                  data: JSON.parse(decompressed.toString()) as T,
                  metadata
                };
              } else {
                entry = {
                  data: parsed.data as T,
                  metadata
                };
              }

              // Store in L1 cache for faster future access
              if (options.l1Cache !== false) {
                this.l1Cache.set(cacheKey, entry);
              }

              // Update access metadata in Redis (preserve compression flag and data)
              const ttl = await redis.ttl(cacheKey);
              const refreshedEntry: SerializedCacheEntry<T> = {
                data: parsed.data,
                metadata
              };

              if (ttl > 0) {
                await redis.setex(cacheKey, ttl, JSON.stringify(refreshedEntry));
              } else {
                await redis.set(cacheKey, JSON.stringify(refreshedEntry));
              }

              this.metrics.hits++;
              console.debug(`Cache hit (L2): ${key}`);
              return entry.data;
            } catch (parseError) {
              console.error('Failed to parse cached data:', parseError);
              await redis.del(cacheKey);
            }
          }
        } catch (redisError) {
          // Redis not available, L1 cache only
        }
      }

      this.metrics.misses++;
      console.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      // Silently fail on cache errors
      this.metrics.misses++;
      return null;
    } finally {
      const duration = Date.now() - startTime;
      this.updateAverageResponseTime(duration);
    }
  }

  /**
   * Set value in cache with compression and metadata
   */
  async set<T = any>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(key, options.version);
    // Ensure TTL is always a valid number
    const ttl = typeof options.ttl === 'number' ? options.ttl :
                typeof options.ttl === 'string' ? parseInt(options.ttl, 10) :
                this.defaultTTL;
    const redis = this.redis;

    try {
      const serializedValue = JSON.stringify(value);
      const originalSize = Buffer.byteLength(serializedValue, 'utf8');
      
      let redisData: T | string = value;
      let compressed = false;
      let compressedSize = originalSize;

      // Compress large payloads
      if (options.compress !== false && originalSize > this.compressionThreshold) {
        try {
          const compressedBuffer = await gzipAsync(serializedValue);
          const base64Compressed = compressedBuffer.toString('base64');
          compressedSize = Buffer.byteLength(base64Compressed, 'utf8');
          
          // Only use compression if it actually saves space
          if (compressedSize < originalSize * 0.8) {
            redisData = base64Compressed;
            compressed = true;
            
            // Update compression ratio metric
            this.metrics.compressionRatio = 
              (this.metrics.compressionRatio * this.metrics.sets + (originalSize / compressedSize)) / 
              (this.metrics.sets + 1);
          }
        } catch (compressionError) {
          console.warn('Compression failed, storing uncompressed:', compressionError);
        }
      }

      const metadata = {
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        tags: options.tags,
        compressed,
        originalSize,
        compressedSize
      };

      const redisEntry: SerializedCacheEntry<T> = {
        data: redisData,
        metadata
      };

      // Store in Redis (L2) - only if Redis is enabled and connected
      if (redis && this.redisEnabled) {
        const serializedEntry = JSON.stringify(redisEntry);
        await redis.setex(cacheKey, ttl, serializedEntry);
      }

      // Store in L1 cache if enabled
      if (options.l1Cache !== false) {
        // Ensure TTL is a number in milliseconds for L1 cache
        const l1Ttl = Math.min(ttl * 1000, 300000); // Max 5 min in L1
        const l1Entry: CacheEntry<T> = {
          data: value,
          metadata: { ...metadata }
        };
  // Maintain compatibility with lru-cache versions that expect numeric maxAge
  (this.l1Cache as any).set(cacheKey, l1Entry, l1Ttl);
      }

      // Store tags for bulk invalidation
      if (options.tags && options.tags.length > 0) {
        await this.addToTagIndex(options.tags, cacheKey, ttl);
      }

      this.metrics.sets++;
      console.debug(`Cache set: ${key} (compressed: ${compressed}, size: ${originalSize} -> ${compressedSize})`);
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    } finally {
      const duration = Date.now() - startTime;
      this.updateAverageResponseTime(duration);
    }
  }

  /**
   * Delete specific cache entry
   */
  async delete(key: string, version?: string): Promise<boolean> {
    const cacheKey = this.generateCacheKey(key, version);
    const redis = this.redis;

    try {
      // Remove from L1 cache
      this.l1Cache.delete(cacheKey);

      // Remove from L2 cache
      let result = 0;
      if (redis && this.redisEnabled) {
        result = await redis.del(cacheKey);
      }
      
      this.metrics.deletes++;
      console.debug(`Cache delete: ${key}`);
      return result > 0;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Add cache key to tag index for bulk operations
   */
  private async addToTagIndex(tags: string[], cacheKey: string, ttl: number): Promise<void> {
    const redis = this.redis;
    if (!redis || !this.redisEnabled) {
      return; // Skip tag indexing if Redis is not available
    }
    
    const pipeline = redis.pipeline();
    
    for (const tag of tags) {
      const tagKey = `${this.keyPrefix}tag:${tag}`;
      pipeline.sadd(tagKey, cacheKey);
      pipeline.expire(tagKey, ttl + 3600); // Tags live 1 hour longer
    }
    
    await pipeline.exec();
  }

  /**
   * Invalidate all cache entries with specific tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    if (tags.length === 0) return 0;
    const redis = this.redis;
    if (!redis || !this.redisEnabled) {
      return 0;
    }

    try {
      let keysToDelete = new Set<string>();

      // Collect all keys with these tags
      for (const tag of tags) {
        const tagKey = `${this.keyPrefix}tag:${tag}`;
        const taggedKeys = await redis.smembers(tagKey);
        taggedKeys.forEach(key => keysToDelete.add(key));
      }

      if (keysToDelete.size === 0) return 0;

      // Delete from L1 cache
      for (const key of keysToDelete) {
        this.l1Cache.delete(key);
      }

      // Delete from Redis
      const pipeline = redis.pipeline();
      for (const key of keysToDelete) {
        pipeline.del(key);
      }

      // Delete tag indexes
      for (const tag of tags) {
        pipeline.del(`${this.keyPrefix}tag:${tag}`);
      }

      const results = await pipeline.exec();
      const deletedCount = results?.filter(([err, result]) => !err && result === 1).length || 0;

      console.log(`Cache invalidated ${deletedCount} entries for tags: ${tags.join(', ')}`);
      return deletedCount;
    } catch (error) {
      console.error('Cache tag invalidation error:', error);
      return 0;
    }
  }

  /**
   * Warm cache with computed value
   */
  async warmup<T>(key: string, valueProvider: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    // Check if already cached
    const existing = await this.get<T>(key, options);
    if (existing !== null) {
      return existing;
    }

    // Compute and cache
    const value = await valueProvider();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Get or set pattern - atomic cache retrieval with computation
   */
  async getOrSet<T>(key: string, valueProvider: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    const redis = this.redis;
    if (!redis || !this.redisEnabled) {
      return valueProvider();
    }

    // Use Redis distributed lock for expensive computations
    const lockKey = `${this.keyPrefix}lock:${key}`;
    const lockValue = Date.now().toString();
    const lockTTL = 30; // 30 seconds

    try {
      // Acquire lock
      const lockAcquired = await redis.set(lockKey, lockValue, 'EX', lockTTL, 'NX');
      
      if (lockAcquired === 'OK') {
        try {
          // Double-check cache after acquiring lock
          const recheck = await this.get<T>(key, options);
          if (recheck !== null) {
            return recheck;
          }

          // Compute value
          const value = await valueProvider();
          await this.set(key, value, options);
          return value;
        } finally {
          // Release lock
          const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end
          `;
          await redis.eval(script, 1, lockKey, lockValue);
        }
      } else {
        // Wait for lock to be released and try again
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.getOrSet(key, valueProvider, options);
      }
    } catch (error) {
      console.error('Cache getOrSet error:', error);
      // Fall back to direct computation
      return valueProvider();
    }
  }

  /**
   * Clear all cache data
   */
  async clear(): Promise<void> {
    try {
      // Clear L1 cache
      this.l1Cache.clear();

      // Clear Redis cache (only our keys)
      const redis = this.redis;
      if (redis && this.redisEnabled) {
        const keys = await redis.keys(`${this.keyPrefix}*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        console.log(`Cleared ${keys.length} cache entries`);
      } else {
        console.log('Cleared cache entries from L1 only (Redis unavailable)');
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics and metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cache size information
   */
  async getCacheInfo(): Promise<{
    l1Size: number;
    l1MaxSize: number;
    l1ItemCount: number;
    redisMemory: number;
    redisKeyCount: number;
  }> {
    try {
      const l1Size = this.l1Cache.calculatedSize || 0;
      const l1MaxSize = this.l1CacheMaxBytes;
      const l1ItemCount = this.l1Cache.size;

      let redisMemory = 0;
      let redisKeyCount = 0;
      const redis = this.redis;
      if (redis && this.redisEnabled) {
        const redisInfo = await redis.info('memory');
        const memoryMatch = redisInfo.match(/used_memory:(\d+)/);
        redisMemory = memoryMatch ? parseInt(memoryMatch[1]) : 0;

        const redisKeys = await redis.keys(`${this.keyPrefix}*`);
        redisKeyCount = redisKeys.length;
      }

      return {
        l1Size,
        l1MaxSize,
        l1ItemCount,
        redisMemory,
        redisKeyCount
      };
    } catch (error) {
      console.error('Failed to get cache info:', error);
      return {
        l1Size: 0,
        l1MaxSize: 0,
        l1ItemCount: 0,
        redisMemory: 0,
        redisKeyCount: 0
      };
    }
  }

  private updateAverageResponseTime(duration: number): void {
    const totalOperations = this.metrics.hits + this.metrics.misses + this.metrics.sets;
    if (totalOperations === 1) {
      this.metrics.averageResponseTime = duration;
    } else {
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (totalOperations - 1) + duration) / totalOperations;
    }
  }

  /**
   * Shutdown cache service
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down enhanced cache service...');
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    this.l1Cache.clear();
    const redis = this.redis;
    if (redis) {
      await redis.quit();
    }
    
    console.log('Enhanced cache service shutdown complete');
  }
}

// Export singleton instance and factory
export const cacheService = new EnhancedCacheService();

/**
 * Specialized cache implementations for different use cases
 */

export class AICacheService {
  constructor(private cache: EnhancedCacheService) {}

  async cacheAIResponse(
    model: string,
    prompt: string,
    parameters: any,
    response: any,
    ttl: number = 7200 // 2 hours
  ): Promise<void> {
    const key = this.generateAIKey(model, prompt, parameters);
    await this.cache.set(key, response, {
      ttl,
      tags: ['ai', `model:${model}`, 'responses'],
      compress: true,
      version: '1.0'
    });
  }

  async getAIResponse(model: string, prompt: string, parameters: any): Promise<any> {
    const key = this.generateAIKey(model, prompt, parameters);
    return this.cache.get(key, { version: '1.0' });
  }

  private generateAIKey(model: string, prompt: string, parameters: any): string {
    const hash = createHash('sha256')
      .update(JSON.stringify({ model, prompt, parameters }))
      .digest('hex');
    return `ai:${model}:${hash}`;
  }

  async invalidateModelCache(model: string): Promise<number> {
    return this.cache.invalidateByTags([`model:${model}`]);
  }
}

export class DatabaseCacheService {
  constructor(private cache: EnhancedCacheService) {}

  async cacheQuery(
    query: string,
    params: any[],
    result: any,
    ttl: number = 1800 // 30 minutes
  ): Promise<void> {
    const key = this.generateQueryKey(query, params);
    await this.cache.set(key, result, {
      ttl,
      tags: ['database', 'queries'],
      compress: true
    });
  }

  async getQueryResult(query: string, params: any[]): Promise<any> {
    const key = this.generateQueryKey(query, params);
    return this.cache.get(key);
  }

  private generateQueryKey(query: string, params: any[]): string {
    const hash = createHash('sha256')
      .update(JSON.stringify({ query, params }))
      .digest('hex');
    return `db:query:${hash}`;
  }

  async invalidateTableCache(tableName: string): Promise<number> {
    return this.cache.invalidateByTags([`table:${tableName}`]);
  }
}

// Export specialized cache services
export const aiCache = new AICacheService(cacheService);
export const dbCache = new DatabaseCacheService(cacheService);
export default cacheService;