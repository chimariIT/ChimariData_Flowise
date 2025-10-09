// server/services/cache.ts
interface CacheEntry<T> {
    data: T;
    expiry: number | null;
}

export class AppCache {
    private cache = new Map<string, CacheEntry<any>>();

    constructor() {
        // Periodically clean up expired entries
        setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
    }

    get<T>(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }

        if (entry.expiry && Date.now() > entry.expiry) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.data as T;
    }

    set<T>(key: string, data: T, ttl: number | null = null): void {
        const expiry = ttl ? Date.now() + ttl : null;
        this.cache.set(key, { data, expiry });
    }

    delete(key: string): void {
        this.cache.delete(key);
    }

    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiry && now > entry.expiry) {
                this.cache.delete(key);
            }
        }
    }
}
