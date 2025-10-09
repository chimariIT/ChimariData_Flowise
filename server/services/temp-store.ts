// server/services/temp-store.ts
import { AppCache } from './cache';

// This is a simple in-memory store for passing data between requests,
// particularly for the trial workflow.
export const tempStore = new AppCache();
