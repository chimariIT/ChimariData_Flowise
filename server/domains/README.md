# Domains Module

This directory contains domain-specific modules for the platform. Each domain follows the same structure:

```
server/domains/
├── project/         # Project management domain
├── analysis/        # Analysis execution domain
├── data-science/   # Data science operations domain
├── mcp/            # MCP tool registry domain
├── billing/         # Billing and subscriptions domain
└── ...
```

## Domain Structure

Each domain follows this structure:

```
domain-name/
├── index.ts              # Barrel export
├── types.ts              # Domain-specific types
├── service.ts            # Core service (singleton)
├── handlers/            # HTTP route handlers
│   ├── index.ts
│   ├── crud.ts
│   └── ...
└── README.md             # Domain documentation
```

## Usage

```typescript
import { projectService } from './domains/project';
import { analysisService } from './domains/analysis';
```

## Implementation Order

1. ✅ Week 1: Phase 1 Foundation (shared types, utils)
2. Week 2: ARCH-1 - Project Domain
3. Week 3: ARCH-2 - Analysis Domain
4. Week 4: ARCH-3 - Data Science Domain
5. Week 5: ARCH-4 - MCP Tool Registry
6. Week 6: ARCH-5 - Billing Domain
7. Week 7-8: Client-side modules
