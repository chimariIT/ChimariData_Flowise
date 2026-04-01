# Shared Module

This directory contains shared types, utilities, and helper functions used across all domains in the platform.

## Structure

```
server/shared/
├── types/           # Shared type definitions
│   ├── index.ts                    # Barrel export
│   ├── domain-types.ts            # Common domain interfaces
│   ├── project-types.ts            # Project-specific types
│   ├── analysis-types.ts           # Analysis-specific types
│   ├── dataset-types.ts            # Dataset-specific types
│   ├── utility-types.ts            # Utility types
│   └── api-types.ts              # API request/response types
└── utils/           # Shared utility functions
    ├── index.ts                    # Barrel export
    ├── validation.ts               # Validation functions
    ├── error-handling.ts           # Error classes
    ├── data-helpers.ts             # Data manipulation
    ├── string-helpers.ts           # String utilities
    ├── date-helpers.ts            # Date/time utilities
    └── async-helpers.ts           # Async utilities
```

## Usage

### Importing Types

```typescript
import type { ProjectConfig, AnalysisType, DatasetStatus } from '../shared/types';
```

### Using Utilities

```typescript
import {
  isValidUUID,
  deepClone,
  capitalize,
  retry,
  asyncHandler,
} from '../shared/utils';
```

## Guidelines

1. **Add to shared when**:
   - Used by 2+ different domains
   - Pure function with no side effects
   - Type definitions that prevent duplication

2. **Don't add to shared when**:
   - Domain-specific business logic
   - Only used by one domain
   - Has side effects (e.g., database calls)

## Testing

Run shared utilities tests:

```bash
npm run test:unit -- tests/unit/shared/
```

## Related

- `server/domains/` - Domain modules that use shared types/utils
- `shared/schema.ts` - Database schema types (Drizzle + Zod)
