declare module 'lru-cache' {
  export interface LRUCacheOptions<K = any, V = any> {
    max?: number;
    maxSize?: number;
    sizeCalculation?: (value: V, key: K) => number;
    ttl?: number;
    ttlAutopurge?: boolean;
    allowStale?: boolean;
    updateAgeOnGet?: boolean;
    updateAgeOnHas?: boolean;
    dispose?: (value: V, key: K, reason: 'evict' | 'delete' | 'dispose') => void;
    disposeAfter?: (value: V, key: K, reason: 'evict' | 'delete' | 'dispose') => void;
    noDisposeOnSet?: boolean;
  }

  export default class LRUCache<K = any, V = any> {
    constructor(options?: LRUCacheOptions<K, V>);
    get(key: K, options?: { updateAgeOnGet?: boolean }): V | undefined;
    set(key: K, value: V, options?: { ttl?: number }): this;
    delete(key: K): boolean;
    has(key: K): boolean;
    clear(): void;
    purgeStale(): void;
    resize(newSize: number): void;
    forEach(callback: (value: V, key: K, cache: this) => void, thisArg?: any): void;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[K, V]>;
    dump(): Array<[K, V]>;
    load(entries: Array<[K, V]>): void;
    get size(): number;
    get calculatedSize(): number;
  }
}
