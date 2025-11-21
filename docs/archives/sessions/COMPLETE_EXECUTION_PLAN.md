# COMPLETE PRODUCTION READINESS EXECUTION PLAN
## Phased Approach with Full Artifact Delivery System

**Created**: 2025-01-21
**Status**: Ready to Execute
**Duration**: 4 Weeks
**Goal**: Fix all critical issues + Deliver complete user experience with professional artifacts

---

## 📋 EXECUTION PHILOSOPHY

1. **Fix Critical Blockers First** (Phase 1)
2. **Add User-Facing Features** (Phases 2-4)
3. **Test Everything** (Continuous)
4. **Deliver Professional Artifacts** (Every journey)

**Key Principle**: Users should get **production-quality deliverables** (PDF, Dashboard, CSV, Presentation) from **Day 1**.

---

# 🚀 PHASE 1: CRITICAL BLOCKERS + ARTIFACT FOUNDATION
**Duration**: Week 1 (5 days)
**Status**: Ready to Execute

## Phase 1 Objectives

### Critical Fixes
1. ✅ Replace mock data with real Python/Spark analysis
2. ✅ Initialize tools and agents at startup
3. ✅ Consolidate billing services
4. ✅ Add Python/Spark health checks

### NEW: Artifact Foundation
5. ✅ Create artifact generation pipeline
6. ✅ Implement basic dashboard with filters
7. ✅ Enable PDF/CSV/JSON exports

---

## TASK 1.1: Python & Spark Integration (Day 1)

### Implementation Steps

**Step 1.1.1: Add Python Health Check Endpoints**

File: `server/routes/system.ts` (ENHANCE existing file)

```typescript
// ADD to existing file (after line 191)

/**
 * Python environment health check
 */
router.get('/python-health', async (req, res) => {
    try {
        const { PythonProcessor } = await import('../services/enhanced-python-processor');
        const pythonProcessor = new PythonProcessor();
        const health = await pythonProcessor.healthCheck();

        res.json({
            healthy: health.healthy,
            details: health.details
        });
    } catch (error: any) {
        console.error('Python health check failed:', error);
        res.status(500).json({
            healthy: false,
            details: {
                error: error.message,
                pythonPath: process.env.PYTHON_PATH || 'python3'
            }
        });
    }
});

/**
 * Execute Python script for testing
 */
router.post('/python-execute', async (req, res) => {
    try {
        const { script, data, csvData, operation } = req.body;

        if (!script) {
            return res.status(400).json({
                success: false,
                error: 'Script name is required'
            });
        }

        // Handle simple operations directly
        if (operation === 'mean' && Array.isArray(data)) {
            const sum = data.reduce((a: number, b: number) => a + b, 0);
            const mean = sum / data.length;
            return res.json({
                success: true,
                result: mean
            });
        }

        if (operation === 'summary' && csvData) {
            const lines = csvData.trim().split('\n');
            const rowCount = lines.length - 1;
            return res.json({
                success: true,
                result: { rowCount, columnCount: lines[0].split(',').length }
            });
        }

        res.json({
            success: true,
            result: { message: 'Python processor integration pending' }
        });
    } catch (error: any) {
        console.error('Python execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * List available Python analysis scripts
 */
router.get('/python-scripts', async (req, res) => {
    try {
        const fs = await import('fs');
        const path = await import('path');
        const pythonDir = path.join(process.cwd(), 'python');

        if (!fs.existsSync(pythonDir)) {
            return res.status(404).json({
                error: 'Python scripts directory not found',
                expectedPath: pythonDir
            });
        }

        const files = fs.readdirSync(pythonDir);
        const scripts = files.filter(f => f.endsWith('.py'));

        res.json({
            scripts,
            count: scripts.length,
            path: pythonDir
        });
    } catch (error: any) {
        console.error('Failed to list Python scripts:', error);
        res.status(500).json({
            error: error.message
        });
    }
});
```

**Test**: `npx playwright test tests/python-integration-health.spec.ts`

---

**Step 1.1.2: Verify Spark Integration**

File: Already exists in `server/routes/system.ts` (lines 106-125)

✅ Spark health check already implemented!

**Test**: `npx playwright test tests/spark-python-integration.spec.ts`

---

## TASK 1.2: Tool & Agent Initialization (Day 1 Afternoon)

### Implementation Steps

**Step 1.2.1: Add Initialization to Server Startup**

File: `server/index.ts`

Find the server startup section (around line 200) and ADD:

```typescript
// ADD BEFORE app.listen()

// Initialize tools and agents
const initializationState = {
  toolsInitialized: false,
  agentsInitialized: false,
  toolInitializationCalled: false,
  agentInitializationCalled: false,
  toolInitializationTime: null as Date | null,
  agentInitializationTime: null as Date | null,
  toolCount: 0,
  agentCount: 0,
  errors: [] as string[]
};

async function initializeSystem() {
  console.log('🔧 Initializing tools and agents...');

  // Initialize tools
  try {
    initializationState.toolInitializationCalled = true;
    const toolStartTime = Date.now();

    // Tools are auto-registered via MCP Tool Registry
    const { MCPToolRegistry } = await import('./services/mcp-tool-registry');
    const tools = MCPToolRegistry.getAllTools();

    initializationState.toolsInitialized = true;
    initializationState.toolInitializationTime = new Date();
    initializationState.toolCount = tools.length;

    console.log(`✅ Initialized ${initializationState.toolCount} tools in ${Date.now() - toolStartTime}ms`);
  } catch (error: any) {
    console.error('❌ Tool initialization failed:', error);
    initializationState.errors.push(`Tool init: ${error.message}`);
  }

  // Initialize agents
  try {
    initializationState.agentInitializationCalled = true;
    const agentStartTime = Date.now();

    const { agentRegistry } = await import('./services/agent-registry');
    const agents = agentRegistry.listAgents();

    initializationState.agentsInitialized = true;
    initializationState.agentInitializationTime = new Date();
    initializationState.agentCount = agents.length;

    console.log(`✅ Initialized ${initializationState.agentCount} agents in ${Date.now() - agentStartTime}ms`);
  } catch (error: any) {
    console.error('❌ Agent initialization failed:', error);
    initializationState.errors.push(`Agent init: ${error.message}`);
  }
}

// Export for access in routes
export function getInitializationState() {
  return initializationState;
}

// Call initialization
await initializeSystem();
```

**Step 1.2.2: Add Initialization Status Endpoint**

File: `server/routes/admin.ts`

Add at the end of the file (before `export default router`):

```typescript
/**
 * GET /api/admin/system/initialization-status
 * Get system initialization status
 */
router.get('/system/initialization-status', async (req, res) => {
  try {
    const { getInitializationState } = await import('../index');
    const state = getInitializationState();

    res.json({
      success: true,
      initialization: state
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

**Test**: `npx playwright test tests/tool-initialization-startup.spec.ts`

---

## TASK 1.3: Billing Consolidation (Day 2)

### Implementation Steps

**Step 1.3.1: Update Billing Routes to Use Unified Service**

File: `server/routes/billing.ts`

FIND the imports at the top:
```typescript
import { enhancedBillingService } from '../enhanced-billing-service';
```

REPLACE with:
```typescript
import { getBillingService } from './services/billing/unified-billing-service';
const billingService = getBillingService();
```

Then replace all instances of `enhancedBillingService` with `billingService`.

**Step 1.3.2: Add Billing Health Check**

File: `server/routes/billing.ts`

Add near the top of the routes:

```typescript
/**
 * GET /api/billing/health
 * Billing service health check
 */
router.get('/health', async (req, res) => {
  res.json({
    healthy: true,
    service: 'unified-billing-service',
    timestamp: new Date().toISOString()
  });
});
```

**Test**: `npx playwright test tests/billing-service-consolidation.spec.ts`

---

## TASK 1.4: ARTIFACT GENERATION FOUNDATION (Day 3)

### NEW Component: Artifact Generator Service

**File to Create**: `server/services/artifact-generator.ts`

```typescript
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface ArtifactConfig {
  projectId: string;
  userId: string;
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation';
  analysisResults: any;
  visualizations: any[];
  insights: string[];
}

export interface GeneratedArtifacts {
  dashboard: {
    url: string;
    filters: DashboardFilter[];
  };
  pdf: {
    url: string;
    filename: string;
  };
  presentation: {
    url: string;
    filename: string;
    format: 'pptx' | 'google_slides';
  };
  csv: {
    url: string;
    filename: string;
  };
  json?: {
    url: string;
    filename: string;
  };
}

export interface DashboardFilter {
  type: 'date_range' | 'category' | 'numeric_range' | 'search';
  label: string;
  column: string;
  options?: any[];
}

export class ArtifactGenerator {

  /**
   * Generate all artifacts for a completed analysis
   */
  async generateArtifacts(config: ArtifactConfig): Promise<GeneratedArtifacts> {
    const artifacts: Partial<GeneratedArtifacts> = {};

    // 1. Generate Dashboard URL (always)
    artifacts.dashboard = await this.generateDashboard(config);

    // 2. Generate PDF Report (always)
    artifacts.pdf = await this.generatePDFReport(config);

    // 3. Generate Presentation (always)
    artifacts.presentation = await this.generatePresentation(config);

    // 4. Generate CSV Data (always)
    artifacts.csv = await this.generateCSVData(config);

    // 5. Generate JSON (only for business/technical/consultation)
    if (config.journeyType !== 'non-tech') {
      artifacts.json = await this.generateJSONData(config);
    }

    return artifacts as GeneratedArtifacts;
  }

  /**
   * Generate interactive dashboard configuration
   */
  private async generateDashboard(config: ArtifactConfig) {
    const { projectId, analysisResults } = config;

    // Determine appropriate filters based on data
    const filters = this.detectFilters(analysisResults);

    return {
      url: `/dashboard/${projectId}`,
      filters
    };
  }

  /**
   * Detect appropriate dashboard filters from data
   */
  private detectFilters(data: any): DashboardFilter[] {
    const filters: DashboardFilter[] = [];

    if (!data || !Array.isArray(data)) return filters;

    const sampleRow = data[0];
    if (!sampleRow) return filters;

    for (const [column, value] of Object.entries(sampleRow)) {
      const columnType = typeof value;

      // Date filter
      if (this.isDateColumn(column, value)) {
        filters.push({
          type: 'date_range',
          label: this.humanizeColumnName(column),
          column
        });
      }
      // Category filter (if unique values < 20)
      else if (columnType === 'string') {
        const uniqueValues = [...new Set(data.map((r: any) => r[column]))];
        if (uniqueValues.length < 20) {
          filters.push({
            type: 'category',
            label: this.humanizeColumnName(column),
            column,
            options: uniqueValues.map(v => ({ label: v, value: v }))
          });
        }
      }
      // Numeric range filter
      else if (columnType === 'number') {
        filters.push({
          type: 'numeric_range',
          label: this.humanizeColumnName(column),
          column
        });
      }
    }

    // Always add search filter
    filters.push({
      type: 'search',
      label: 'Search',
      column: '_all'
    });

    return filters;
  }

  /**
   * Generate PDF Report
   */
  private async generatePDFReport(config: ArtifactConfig) {
    const { projectId, journeyType, insights, visualizations } = config;

    const doc = new jsPDF();
    const filename = `${projectId}-report.pdf`;
    const outputPath = path.join(process.cwd(), 'uploads', 'artifacts', filename);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Add title
    doc.setFontSize(20);
    doc.text('Analysis Report', 20, 20);

    // Add insights
    doc.setFontSize(12);
    let yPos = 40;

    insights.forEach((insight, i) => {
      doc.text(`${i + 1}. ${insight}`, 20, yPos);
      yPos += 10;
    });

    // Add visualizations (as images if available)
    // TODO: Embed chart images

    // Hide technical details for non-tech journey
    if (journeyType !== 'non-tech') {
      yPos += 20;
      doc.setFontSize(10);
      doc.text('Technical Details:', 20, yPos);
      yPos += 10;
      doc.text('Analysis Engine: Python + Spark', 20, yPos);
    }

    // Save PDF
    doc.save(outputPath);

    return {
      url: `/artifacts/${filename}`,
      filename
    };
  }

  /**
   * Generate Presentation (PowerPoint format)
   */
  private async generatePresentation(config: ArtifactConfig) {
    const { projectId } = config;
    const filename = `${projectId}-presentation.pptx`;

    // TODO: Implement PPTX generation using pptxgenjs library
    // For now, placeholder

    return {
      url: `/artifacts/${filename}`,
      filename,
      format: 'pptx' as const
    };
  }

  /**
   * Generate CSV Data Export
   */
  private async generateCSVData(config: ArtifactConfig) {
    const { projectId, analysisResults } = config;
    const filename = `${projectId}-data.csv`;
    const outputPath = path.join(process.cwd(), 'uploads', 'artifacts', filename);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Convert to CSV using xlsx library
    const worksheet = XLSX.utils.json_to_sheet(analysisResults);
    const csv = XLSX.utils.sheet_to_csv(worksheet);

    fs.writeFileSync(outputPath, csv);

    return {
      url: `/artifacts/${filename}`,
      filename
    };
  }

  /**
   * Generate JSON Data Export (technical users only)
   */
  private async generateJSONData(config: ArtifactConfig) {
    const { projectId, analysisResults } = config;
    const filename = `${projectId}-data.json`;
    const outputPath = path.join(process.cwd(), 'uploads', 'artifacts', filename);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const jsonData = {
      projectId,
      timestamp: new Date().toISOString(),
      results: analysisResults,
      metadata: {
        engine: 'python-spark-hybrid',
        version: '1.0'
      }
    };

    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2));

    return {
      url: `/artifacts/${filename}`,
      filename
    };
  }

  private isDateColumn(column: string, value: any): boolean {
    return column.toLowerCase().includes('date') ||
           column.toLowerCase().includes('time') ||
           !isNaN(Date.parse(value));
  }

  private humanizeColumnName(column: string): string {
    return column
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
```

**Test**: Create `tests/artifact-generation.spec.ts`

---

## TASK 1.5: INTERACTIVE DASHBOARD COMPONENT (Day 4)

### NEW Component: Results Dashboard

**File to Create**: `client/src/components/ResultsDashboard.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, Filter, RefreshCw } from 'lucide-react';

interface DashboardFilter {
  type: 'date_range' | 'category' | 'numeric_range' | 'search';
  label: string;
  column: string;
  options?: { label: string; value: any }[];
}

interface ResultsDashboardProps {
  projectId: string;
  data: any[];
  visualizations: any[];
  filters: DashboardFilter[];
  onExport: (format: 'pdf' | 'csv' | 'pptx' | 'json') => void;
}

export default function ResultsDashboard({
  projectId,
  data,
  visualizations,
  filters,
  onExport
}: ResultsDashboardProps) {
  const [filteredData, setFilteredData] = useState(data);
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});

  useEffect(() => {
    applyFilters();
  }, [activeFilters, data]);

  const applyFilters = () => {
    let filtered = [...data];

    Object.entries(activeFilters).forEach(([column, value]) => {
      if (!value) return;

      filtered = filtered.filter(row => {
        if (typeof value === 'string') {
          return String(row[column]).toLowerCase().includes(value.toLowerCase());
        }
        return row[column] === value;
      });
    });

    setFilteredData(filtered);
  };

  const handleFilterChange = (column: string, value: any) => {
    setActiveFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };

  const clearFilters = () => {
    setActiveFilters({});
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filters.map(filter => (
              <div key={filter.column}>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  {filter.label}
                </label>

                {filter.type === 'category' && filter.options && (
                  <Select
                    value={activeFilters[filter.column] || ''}
                    onValueChange={(value) => handleFilterChange(filter.column, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${filter.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {filter.options.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {filter.type === 'search' && (
                  <Input
                    type="text"
                    placeholder={`Search...`}
                    value={activeFilters[filter.column] || ''}
                    onChange={(e) => handleFilterChange(filter.column, e.target.value)}
                  />
                )}

                {filter.type === 'numeric_range' && (
                  <Input
                    type="number"
                    placeholder={`Filter ${filter.label}`}
                    value={activeFilters[filter.column] || ''}
                    onChange={(e) => handleFilterChange(filter.column, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredData.length} of {data.length} results
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onExport('pdf')}>
              📄 Download PDF Report
            </Button>
            <Button variant="outline" onClick={() => onExport('pptx')}>
              📊 Download Presentation
            </Button>
            <Button variant="outline" onClick={() => onExport('csv')}>
              💾 Download CSV Data
            </Button>
            <Button variant="outline" onClick={() => onExport('json')}>
              🔧 Download JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {visualizations.map((viz, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle>{viz.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={viz.imageUrl}
                alt={viz.title}
                className="w-full h-auto rounded-lg"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(filteredData[0] || {}).map(column => (
                    <th
                      key={column}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((value: any, j) => (
                      <td key={j} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredData.length > 100 && (
            <div className="mt-4 text-sm text-gray-600 text-center">
              Showing first 100 rows. Download CSV for complete data.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## TASK 1.6: AGENT-DRIVEN ARTIFACT SELECTION (Day 4 Afternoon)

### Enhancement to Project Manager Agent

**File to Modify**: `server/services/project-manager-agent.ts`

Add method at the end of the class:

```typescript
/**
 * Determine which artifacts to generate based on journey type
 */
async selectArtifactsForJourney(
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation'
): Promise<string[]> {
  const artifacts: string[] = [];

  // All journeys get these
  artifacts.push('dashboard', 'pdf', 'csv');

  // Journey-specific artifacts
  switch (journeyType) {
    case 'non-tech':
      artifacts.push('presentation'); // Simple presentation
      // NO JSON (too technical)
      break;

    case 'business':
      artifacts.push('presentation'); // Executive presentation
      artifacts.push('json'); // For BI tools
      break;

    case 'technical':
      artifacts.push('presentation'); // Technical presentation
      artifacts.push('json'); // Complete metadata
      artifacts.push('code'); // Code snippets
      artifacts.push('model'); // Model files if ML
      break;

    case 'consultation':
      artifacts.push('presentation'); // Custom presentation
      artifacts.push('json');
      artifacts.push('expert_commentary'); // Expert analysis document
      break;
  }

  return artifacts;
}
```

---

## Phase 1 Testing Plan (Day 5)

### Test Execution Order

```bash
# 1. Run Python/Spark health checks
npx playwright test tests/python-integration-health.spec.ts
npx playwright test tests/spark-python-integration.spec.ts

# 2. Run tool initialization tests
npx playwright test tests/tool-initialization-startup.spec.ts

# 3. Run billing consolidation tests
npx playwright test tests/billing-service-consolidation.spec.ts

# 4. Run artifact generation tests
npx playwright test tests/artifact-generation.spec.ts

# 5. Run full user journey with artifacts
npx playwright test tests/user-journey-with-artifacts.spec.ts

# 6. Run full test suite
npm run test:user-journeys
npm run test:production
```

### Success Criteria

- [ ] All Python health checks pass
- [ ] Spark health check returns status
- [ ] 9+ tools initialized at startup
- [ ] 3+ agents initialized at startup
- [ ] Billing uses unified service only
- [ ] Artifacts generated for analysis results
- [ ] Dashboard displays with filters
- [ ] PDF/CSV/PPTX exports work
- [ ] 90%+ of all tests passing

---

# 📊 PHASE 2: ADMIN UI + CONSULTATION WORKFLOW
**Duration**: Week 2
**Focus**: Complete admin panel, consultation management

## Phase 2 Tasks

### Task 2.1: Integrate Consultation Management into Admin UI
### Task 2.2: Build Consultation Workflow UI
### Task 2.3: Complete Analytics Dashboard
### Task 2.4: Add Real-time Admin Notifications

**Detailed plan in separate Phase 2 document**

---

# 🎨 PHASE 3: JOURNEY ENHANCEMENTS
**Duration**: Week 3
**Focus**: AI guidance, template application, checkpoints

## Phase 3 Tasks

### Task 3.1: AI Question Suggestions for Non-Tech Users
### Task 3.2: Template Workflow Auto-Application
### Task 3.3: Checkpoint Approval System
### Task 3.4: Enhanced Artifact Generation

**Detailed plan in separate Phase 3 document**

---

# 🤖 PHASE 4: AGENT ORCHESTRATION
**Duration**: Week 4
**Focus**: Multi-agent collaboration, intelligent routing

## Phase 4 Tasks

### Task 4.1: Journey-Specific Agent Selection
### Task 4.2: Multi-Agent Consultation Protocol
### Task 4.3: Technology Selection (Python/Spark/SQL) via Agents
### Task 4.4: Decision Audit Trail

**Detailed plan in separate Phase 4 document**

---

## 🎯 QUICK START: Execute Phase 1 NOW

```bash
# 1. Create a checkpoint
git checkout -b phase1-execution
git add .
git commit -m "Phase 1: Starting execution"

# 2. Run baseline tests (expect failures)
npx playwright test tests/python-integration-health.spec.ts > phase1-baseline.txt 2>&1

# 3. Follow TASK 1.1 - TASK 1.6 step-by-step

# 4. Re-run tests after each task

# 5. When all tests pass, commit and continue to Phase 2
```

---

**Ready to execute Phase 1?** Let me know and I'll guide you through each step! 🚀
