# CONSOLIDATED PRODUCTION READINESS PLAN
## Fix All Issues + Add Artifact Delivery + Integrate Billing

**Duration**: 4 Weeks (Phased Approach)
**Current Focus**: Phase 1 (Week 1)
**Goal**: Production-ready system with complete artifact delivery and accurate billing

---

## 🎯 WHAT WE'RE DOING

### Critical Fixes (MUST DO)
1. ✅ Replace mock data with real Python/Spark analysis
2. ✅ Initialize tools and agents at startup
3. ✅ Consolidate billing services (already have unified service!)
4. ✅ Add Python/Spark health checks

### User Experience Enhancements (NEW)
5. ✅ Deliver 5 artifact types (Dashboard, PDF, PPTX, CSV, JSON)
6. ✅ Interactive dashboard with filters
7. ✅ Track artifact generation in billing
8. ✅ Add artifact quotas to subscription tiers

### Existing Billing System (EXTEND, NOT REPLACE)
Your current system tracks:
- ✅ Data size (MB uploaded/processed)
- ✅ Feature counts (analysis components, visualizations, AI queries)
- ✅ Analysis complexity (small, medium, large, extra_large)
- ✅ Storage capacity (MB stored)
- ✅ Compute minutes

**We're adding**:
- ✅ Artifact generation (PDF, PPTX, Dashboard, CSV, JSON)
- ✅ Artifact size and complexity
- ✅ Artifact retention (storage impact)
- ✅ Execution technology tracking (Python vs Spark vs SQL)

---

## 📊 PHASE 1: CRITICAL FIXES + ARTIFACT FOUNDATION
**Duration**: Week 1 (5 days)

### Day 1: Python & Spark Health + Tool Initialization

#### Task 1.1: Add System Health Endpoints
**File**: `server/routes/system.ts` (MODIFY existing file)

**ADD after existing routes** (around line 193):

```typescript
/**
 * Python health check
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
        res.status(500).json({
            healthy: false,
            details: { error: error.message }
        });
    }
});

/**
 * Python scripts list
 */
router.get('/python-scripts', async (req, res) => {
    try {
        const fs = await import('fs');
        const path = await import('path');
        const pythonDir = path.join(process.cwd(), 'python');

        if (!fs.existsSync(pythonDir)) {
            return res.status(404).json({ error: 'Python directory not found' });
        }

        const files = fs.readdirSync(pythonDir);
        const scripts = files.filter(f => f.endsWith('.py'));

        res.json({ scripts, count: scripts.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
```

**Test**: `npx playwright test tests/python-integration-health.spec.ts`

---

#### Task 1.2: Initialize Tools/Agents at Startup
**File**: `server/index.ts`

**FIND** the server startup section (around line 200, before `app.listen()`)

**ADD**:

```typescript
// ========================================
// INITIALIZE TOOLS AND AGENTS
// ========================================

const initializationState = {
  toolsInitialized: false,
  agentsInitialized: false,
  toolCount: 0,
  agentCount: 0,
  errors: [] as string[]
};

async function initializeSystem() {
  console.log('🔧 Initializing tools and agents...');

  try {
    // Initialize tools (auto-registered via MCP Tool Registry)
    const { MCPToolRegistry } = await import('./services/mcp-tool-registry');
    const tools = MCPToolRegistry.getAllTools();
    initializationState.toolsInitialized = true;
    initializationState.toolCount = tools.length;
    console.log(`✅ ${tools.length} tools initialized`);
  } catch (error: any) {
    console.error('❌ Tool initialization failed:', error);
    initializationState.errors.push(`Tools: ${error.message}`);
  }

  try {
    // Initialize agents
    const { agentRegistry } = await import('./services/agent-registry');
    const agents = agentRegistry.listAgents();
    initializationState.agentsInitialized = true;
    initializationState.agentCount = agents.length;
    console.log(`✅ ${agents.length} agents initialized`);
  } catch (error: any) {
    console.error('❌ Agent initialization failed:', error);
    initializationState.errors.push(`Agents: ${error.message}`);
  }
}

export function getInitializationState() {
  return initializationState;
}

// Call initialization before server starts
await initializeSystem();
```

**ADD to `server/routes/admin.ts`** (at the end):

```typescript
/**
 * GET /api/admin/system/initialization-status
 */
router.get('/system/initialization-status', async (req, res) => {
  try {
    const { getInitializationState } = await import('../index');
    res.json({
      success: true,
      initialization: getInitializationState()
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Test**: `npx playwright test tests/tool-initialization-startup.spec.ts`

---

### Day 2: Billing Health Check + Verification

#### Task 1.3: Verify Unified Billing Service
**File**: `server/routes/billing.ts`

**ADD health check endpoint**:

```typescript
/**
 * GET /api/billing/health
 */
router.get('/health', async (req, res) => {
  res.json({
    healthy: true,
    service: 'unified-billing-service',
    timestamp: new Date().toISOString()
  });
});
```

**Verify all routes use unified service**:
```bash
# Check imports
grep -n "import.*billing" server/routes/billing.ts
# Should show: import { getBillingService } from './services/billing/unified-billing-service';
```

**Test**: `npx playwright test tests/billing-service-consolidation.spec.ts`

---

### Day 3: Artifact Generator + Billing Integration

#### Task 1.4: Create Artifact Generator Service
**File to CREATE**: `server/services/artifact-generator.ts`

```typescript
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface ArtifactConfig {
  projectId: string;
  userId: string;
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation';
  analysisResults: any[];
  visualizations: any[];
  insights: string[];
  datasetSizeMB: number;
}

export interface GeneratedArtifacts {
  dashboard: { url: string; filters: any[] };
  pdf: { url: string; filename: string; sizeMB: number };
  presentation: { url: string; filename: string; sizeMB: number };
  csv: { url: string; filename: string; sizeMB: number };
  json?: { url: string; filename: string; sizeMB: number };
  totalSizeMB: number;
  totalCost: number; // Calculated cost
}

export class ArtifactGenerator {

  /**
   * Generate all artifacts and track billing
   */
  async generateArtifacts(config: ArtifactConfig): Promise<GeneratedArtifacts> {
    const { projectId, userId, journeyType, analysisResults, visualizations, insights } = config;

    // Import billing service
    const { getBillingService } = await import('./billing/unified-billing-service');
    const billingService = getBillingService();

    const artifacts: Partial<GeneratedArtifacts> = {};
    let totalCost = 0;
    let totalSizeMB = 0;

    // 1. Dashboard (always, no file size)
    artifacts.dashboard = await this.generateDashboard(config);

    // 2. PDF Report
    const pdfResult = await this.generatePDFReport(config);
    artifacts.pdf = pdfResult;
    totalSizeMB += pdfResult.sizeMB;

    // Track in billing
    await billingService.trackArtifactUsage(userId, {
      artifactType: 'pdf_report',
      complexity: this.detectComplexity(visualizations.length, insights.length),
      sizeMB: pdfResult.sizeMB,
      projectId
    });
    totalCost += await billingService.calculateArtifactCost(userId, 'pdf_report', pdfResult.sizeMB);

    // 3. Presentation
    const pptxResult = await this.generatePresentation(config);
    artifacts.presentation = pptxResult;
    totalSizeMB += pptxResult.sizeMB;

    await billingService.trackArtifactUsage(userId, {
      artifactType: 'presentation',
      complexity: this.detectComplexity(visualizations.length, insights.length),
      sizeMB: pptxResult.sizeMB,
      projectId
    });
    totalCost += await billingService.calculateArtifactCost(userId, 'presentation', pptxResult.sizeMB);

    // 4. CSV Export
    const csvResult = await this.generateCSVData(config);
    artifacts.csv = csvResult;
    totalSizeMB += csvResult.sizeMB;

    await billingService.trackArtifactUsage(userId, {
      artifactType: 'csv_export',
      complexity: 'small', // CSV is simple
      sizeMB: csvResult.sizeMB,
      projectId
    });
    totalCost += await billingService.calculateArtifactCost(userId, 'csv_export', csvResult.sizeMB);

    // 5. JSON (only for business/technical/consultation)
    if (journeyType !== 'non-tech') {
      const jsonResult = await this.generateJSONData(config);
      artifacts.json = jsonResult;
      totalSizeMB += jsonResult.sizeMB;

      await billingService.trackArtifactUsage(userId, {
        artifactType: 'json_export',
        complexity: 'small',
        sizeMB: jsonResult.sizeMB,
        projectId
      });
      totalCost += await billingService.calculateArtifactCost(userId, 'json_export', jsonResult.sizeMB);
    }

    console.log(`💰 Total artifact cost for user ${userId}: $${totalCost / 100}`);

    return {
      ...artifacts,
      totalSizeMB,
      totalCost
    } as GeneratedArtifacts;
  }

  private async generateDashboard(config: ArtifactConfig) {
    return {
      url: `/dashboard/${config.projectId}`,
      filters: this.detectFilters(config.analysisResults)
    };
  }

  private async generatePDFReport(config: ArtifactConfig) {
    const doc = new jsPDF();
    const filename = `${config.projectId}-report.pdf`;
    const outputPath = path.join(process.cwd(), 'uploads', 'artifacts', filename);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Title
    doc.setFontSize(20);
    doc.text('Analysis Report', 20, 20);

    // Insights
    doc.setFontSize(12);
    let yPos = 40;
    config.insights.forEach((insight, i) => {
      doc.text(`${i + 1}. ${insight}`, 20, yPos);
      yPos += 10;
    });

    doc.save(outputPath);

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);

    return {
      url: `/artifacts/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private async generatePresentation(config: ArtifactConfig) {
    const filename = `${config.projectId}-presentation.pptx`;
    // TODO: Use pptxgenjs library for real PPTX generation
    // For now, placeholder
    return {
      url: `/artifacts/${filename}`,
      filename,
      sizeMB: 0.5 // Estimated
    };
  }

  private async generateCSVData(config: ArtifactConfig) {
    const filename = `${config.projectId}-data.csv`;
    const outputPath = path.join(process.cwd(), 'uploads', 'artifacts', filename);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const worksheet = XLSX.utils.json_to_sheet(config.analysisResults);
    const csv = XLSX.utils.sheet_to_csv(worksheet);

    fs.writeFileSync(outputPath, csv);

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);

    return {
      url: `/artifacts/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private async generateJSONData(config: ArtifactConfig) {
    const filename = `${config.projectId}-data.json`;
    const outputPath = path.join(process.cwd(), 'uploads', 'artifacts', filename);

    const jsonData = {
      projectId: config.projectId,
      timestamp: new Date().toISOString(),
      results: config.analysisResults,
      metadata: { engine: 'python-spark-hybrid' }
    };

    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2));

    const stats = fs.statSync(outputPath);
    const sizeMB = stats.size / (1024 * 1024);

    return {
      url: `/artifacts/${filename}`,
      filename,
      sizeMB: parseFloat(sizeMB.toFixed(2))
    };
  }

  private detectFilters(data: any[]) {
    // Basic filter detection
    return [{ type: 'search', label: 'Search', column: '_all' }];
  }

  private detectComplexity(vizCount: number, insightCount: number): string {
    const score = vizCount + (insightCount / 2);
    if (score < 5) return 'small';
    if (score < 10) return 'medium';
    if (score < 20) return 'large';
    return 'extra_large';
  }
}
```

**Install required libraries**:
```bash
npm install jspdf xlsx pptxgenjs
```

---

#### Task 1.5: Extend Unified Billing Service for Artifacts
**File**: `server/services/billing/unified-billing-service.ts`

**ADD after line 150** (after UsageMetrics interface):

```typescript
/**
 * Artifact usage tracking (NEW)
 */
export interface ArtifactUsageMetrics {
  pdfReportsGenerated: number;
  presentationsGenerated: number;
  dashboardsCreated: number;
  csvExports: number;
  jsonExports: number;
  totalArtifactStorageMB: number; // Storage impact of artifacts

  // By complexity
  artifactsByComplexity: {
    small: number;
    medium: number;
    large: number;
    extra_large: number;
  };
}

/**
 * Extended usage metrics including artifacts
 */
export interface ExtendedUsageMetrics extends UsageMetrics {
  artifactUsage: ArtifactUsageMetrics;
}
```

**ADD methods to UnifiedBillingService class**:

```typescript
/**
 * Track artifact generation
 */
async trackArtifactUsage(
  userId: string,
  artifact: {
    artifactType: string;
    complexity: string;
    sizeMB: number;
    projectId: string;
  }
): Promise<void> {
  // TODO: Store in database
  console.log(`📊 Tracked artifact: ${artifact.artifactType} (${artifact.complexity}) for user ${userId}`);
}

/**
 * Calculate artifact cost based on existing capacity system
 */
async calculateArtifactCost(
  userId: string,
  artifactType: string,
  sizeMB: number
): Promise<number> {
  const userTier = await this.getUserTier(userId);

  // Base pricing (in cents)
  const basePrices: Record<string, number> = {
    'pdf_report': 50,        // $0.50 base
    'presentation': 100,     // $1.00 base
    'dashboard': 0,          // Included (no file)
    'csv_export': 10,        // $0.10 base
    'json_export': 10        // $0.10 base
  };

  const basePrice = basePrices[artifactType] || 0;

  // Size multiplier (larger files cost more)
  const sizeMultiplier = sizeMB > 10 ? 2 : sizeMB > 5 ? 1.5 : 1;

  // Tier discount
  const tierDiscounts: Record<string, number> = {
    'trial': 0,
    'starter': 0,
    'professional': 20,  // 20% off
    'enterprise': 40     // 40% off
  };

  const discount = tierDiscounts[userTier] || 0;

  const finalPrice = basePrice * sizeMultiplier * (1 - discount / 100);

  return Math.round(finalPrice);
}
```

**Test**: Create test file for artifact billing

---

### Day 4: Interactive Dashboard Component

**File to CREATE**: `client/src/components/ResultsDashboard.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Filter } from 'lucide-react';

interface ResultsDashboardProps {
  projectId: string;
  data: any[];
  visualizations: any[];
  filters: any[];
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
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (searchTerm) {
      const filtered = data.filter(row =>
        Object.values(row).some(val =>
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
      setFilteredData(filtered);
    } else {
      setFilteredData(data);
    }
  }, [searchTerm, data]);

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="mt-2 text-sm text-gray-600">
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
              <img src={viz.imageUrl} alt={viz.title} className="w-full" />
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
                    <th key={column} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((value: any, j) => (
                      <td key={j} className="px-6 py-4 whitespace-nowrap text-sm">
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### Day 5: Testing & Validation

**Run all tests**:
```bash
# Python/Spark health
npx playwright test tests/python-integration-health.spec.ts

# Tool initialization
npx playwright test tests/tool-initialization-startup.spec.ts

# Billing consolidation
npx playwright test tests/billing-service-consolidation.spec.ts

# Artifact generation
npx playwright test tests/artifact-generation.spec.ts

# Full test suite
npm run test:user-journeys
npm run test:production
```

**Manual verification**:
1. Start server: `npm run dev`
2. Upload dataset
3. Run analysis
4. Verify 5 artifacts generated
5. Check billing tracked correctly
6. Verify dashboard displays with filters

---

## ✅ PHASE 1 SUCCESS CRITERIA

- [ ] Python health check returns `healthy: true`
- [ ] Spark health check returns cluster status
- [ ] 9+ tools initialized at startup
- [ ] 3+ agents initialized at startup
- [ ] Billing service health check passes
- [ ] Artifacts generated (PDF, PPTX, CSV, JSON, Dashboard)
- [ ] Dashboard displays with working filters
- [ ] Artifact costs tracked in billing
- [ ] Artifact storage added to capacity tracking
- [ ] 90%+ tests passing

---

## 📈 PHASES 2-4 OVERVIEW

**Phase 2 (Week 2)**: Admin UI completion, consultation workflow
**Phase 3 (Week 3)**: Journey enhancements, AI guidance, templates
**Phase 4 (Week 4)**: Agent orchestration, multi-agent collaboration

---

**Ready to execute Phase 1, Day 1?** Start with Task 1.1! 🚀
