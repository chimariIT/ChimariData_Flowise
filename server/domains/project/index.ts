/**
 * Project Domain - Barrel Export
 *
 * This file exports all public APIs from the project domain.
 * Full implementation in ARCH-1 (Week 2).
 */

// Services (stubs - to be implemented in ARCH-1)
export * from './project-service';
export * from './transformation-service';
export * from './join-service';
export * from './journey-service';
export * from './checkpoint-service';
export * from './visualizations-service';
export * from './data-elements-service';
export * from './pii-service';
export * from './data-quality-service';

// Handlers (stubs - to be implemented in ARCH-1)
export * from './handlers/project-crud';
export * from './handlers/transformation-handler';
export * from './handlers/join-handler';
export * from './handlers/checkpoint-handler';
export * from './handlers/visualizations-handler';

// Types
export * from './types';

// Main router (stub - to be implemented in ARCH-1)
export { default as projectRouter } from './router';
