// server/services/storage.ts
import { MemStorage, DatabaseStorage } from '../storage';
import { db } from '../db';

/**
 * Use database storage when database is available, fallback to in-memory storage
 */
export const storage = db ? new DatabaseStorage() : new MemStorage();
