# ChimariData Platform - Issues Tracker

**Last Updated**: December 15, 2025
**Total Issues Tracked**: 35
**Fixed**: 32 | **Open**: 0 | **Architectural**: 3

---

## Quick Status Summary

| Category | Fixed | Open | Architectural |
|----------|-------|------|---------------|
| Data Pipeline | 6 | 0 | 0 |
| Requirements Pipeline | 5 | 0 | 0 |
| Analysis Pipeline | 6 | 0 | 1 |
| UI/Frontend | 8 | 0 | 0 |
| Backend/API | 6 | 0 | 1 |
| Billing | 3 | 0 | 1 |

---

## 🔴 Open Issues (Require Attention)

*No open issues - all tracked issues have been fixed!*

---

## 🟡 Architectural Issues (Design Decisions Needed)

| # | Issue | Category | Description | Impact |
|---|-------|----------|-------------|--------|
| 35 | Agent activity premature completion | Agents | Internal orchestrator steps (8) complete in ms, user-facing steps are different | Confusing UX |
| A5 | Billing cost tracking incomplete | Billing | Services exist but not integrated with journey execution | $0 costs shown |
| - | WebSocket dual implementation | Backend | Socket.IO installed but native `ws` used | Maintenance confusion |

---

## ✅ Fixed Issues by Date

### December 15, 2025 (9 fixes)

| # | Issue | File(s) Modified |
|---|-------|------------------|
| 31 | `projectQuestions` import missing - 500 error | `server/routes/project.ts` |
| 32 | WebSocket using Socket.IO instead of native `ws` | `client/src/pages/execute-step.tsx` |
| 20 | PUT `/api/projects/:id/verify` - 404 | `server/routes/project.ts` |
| 27 | Stable question IDs for pipeline traceability | `server/services/tools/required-data-elements-tool.ts` |
| 30 | Verification only loads first dataset - added multi-dataset tab navigation | `client/src/pages/data-verification-step.tsx` |
| 25 | Requirements not passed to transformation UI - made analysis plan always visible | `client/src/pages/data-transformation-step.tsx` |
| 33 | Analysis plan infinite loading - progress endpoint now returns rejectionReason | `server/routes/analysis-plans.ts` |
| 26 | DS recommendations not shown in execute - added DS recommendations card | `client/src/pages/execute-step.tsx` |
| 34 | Billing journey-breakdown 400 - added defaults and type coercion to schema | `server/routes/billing.ts` |

### December 14, 2025 (6 fixes)

| # | Issue | File(s) Modified |
|---|-------|------------------|
| 23/D3 | Transformation endpoint 404 | `server/routes/project.ts` |
| 24/D2 | PII filtering UI-only | `server/routes/project.ts`, `data-verification-step.tsx` |
| 28/R1 | Missing `/recommend-templates` endpoint | `server/routes/project.ts` |
| R6 | DS agent not in orchestrator | `project-agent-orchestrator.ts` |
| D1 | Multi-dataset preview not joined | `data-step.tsx` |
| D5 | Verification shows join indicator | `data-verification-step.tsx` |

### December 11, 2025 (7 fixes)

| # | Issue | File(s) Modified |
|---|-------|------------------|
| 2 | Billing amounts all zero (temp fix) | `analysis-plans.ts`, `analysis-execution.ts` |
| 3 | Workflow steps pre-checked | `workflow.ts` endpoints verified |
| 5 | Decision trail hardcoded | `decision-logger.ts`, `project-agent-orchestrator.ts` |
| 7 | Charts not generating | `visualization-workshop.tsx`, `dashboard-builder.tsx` |
| 15 | Execute step loads stale localStorage questions | `execute-step.tsx` |
| 16 | Approvals don't gate workflow | `project-agent-orchestrator.ts` |
| 17 | Agent-translated results for audience | `AudienceTranslatedResults.tsx`, `prepare-step.tsx` |

### December 10, 2025 (6 fixes)

| # | Issue | File(s) Modified |
|---|-------|------------------|
| 12 | Journey retains old checkpoint data | `project-agent-orchestrator.ts` |
| 13 | Restart journey doesn't clear DB checkpoints | `project-agent-orchestrator.ts` |
| 14 | Question answers not generated | `analysis-execution.ts` |
| 20 | Transformed schema not exposed to frontend | `server/routes/project.ts` |
| 21 | Duplicate checkpoint endpoints | `server/routes/project.ts` |
| 22 | Visualization using original schema only | `visualization-workshop.tsx` |

### December 8, 2025 (4 fixes)

| # | Issue | File(s) Modified |
|---|-------|------------------|
| 9 | View Statistics page buttons | `descriptive-stats-page.tsx` |
| 10 | Multi-file upload duplicate data | `data-step.tsx` |
| 11 | Approvals tab routing | `project-page.tsx` |
| 1 | Resume journey 409 handling | `user-dashboard.tsx` |

---

## Issue Categories

### Data Pipeline Issues

| # | Issue | Status | Description |
|---|-------|--------|-------------|
| D1 | Multi-dataset preview not joined | ✅ FIXED | Users couldn't see joined data before transformation |
| D2 | PII filtering UI-only | ✅ FIXED | PII columns reappeared on refresh |
| D3 | Transformation endpoint 404 | ✅ FIXED | Frontend called wrong endpoint |
| D4 | Verify endpoint mismatch | ✅ FIXED | PUT `/api/projects/:id/verify` was missing |
| D5 | Verification loads first dataset only | ✅ FIXED | Added multi-dataset join indicator |

### Requirements Pipeline Issues

| # | Issue | Status | Description |
|---|-------|--------|-------------|
| R1 | Missing `/recommend-templates` | ✅ FIXED | Researcher Agent endpoint created |
| R2 | Requirements not passed to transformation | ✅ FIXED | Backend returns questionAnswerMapping |
| R3 | No validation before transformation | ⚠️ OPEN | Users can proceed with missing elements |
| R4 | Questions not linked through pipeline | ✅ FIXED | Stable IDs now used throughout |
| R6 | DS agent not in orchestrator | ✅ FIXED | Added data_scientist case |

### Analysis Pipeline Issues

| # | Issue | Status | Description |
|---|-------|--------|-------------|
| A1 | DS recommendations not in execute | ✅ FIXED | Added DS recommendations card (#26) |
| A2 | Analysis creates new question IDs | ✅ FIXED | Now uses stored question IDs |
| A3 | Checkpoint feedback route | ✅ VERIFIED | Route exists at lines 4216 and 5023 |
| A5 | Billing amounts zero | ⚠️ TEMP FIX | Fallback estimates in place |

### Frontend/UI Issues

| # | Issue | Status | Description |
|---|-------|--------|-------------|
| 7 | Charts not generating | ✅ FIXED | Fixed onSave callback in visualization-workshop |
| 8 | Data tab doesn't recognize dataset | ✅ FIXED | sampleData priority fixed |
| 9 | View Statistics buttons | ✅ FIXED | Added onClick handlers |
| 10 | Multi-file upload duplicate data | ✅ FIXED | Changed preview priority |
| 11 | Approvals tab routing | ✅ FIXED | Added "approvals" to allowed tabs |
| 15 | Execute loads stale localStorage | ✅ FIXED | Now loads from API first |
| 17 | Audience-translated results | ✅ FIXED | Default audience based on journey type |
| 32 | WebSocket client mismatch | ✅ FIXED | Replaced Socket.IO with native ws |

### Backend/API Issues

| # | Issue | Status | Description |
|---|-------|--------|-------------|
| 1 | Resume journey fails | ✅ FIXED | Added 409 handling and redirect |
| 12 | Journey retains old checkpoints | ✅ FIXED | Cleanup now deletes from DB |
| 13 | Restart doesn't clear DB | ✅ FIXED | Same fix as #12 |
| 14 | Question answers not generated | ✅ FIXED | Added auto-sync in getUserContext |
| 31 | projectQuestions import missing | ✅ FIXED | Added import to project.ts |
| 33 | Plan generation fails silently | ✅ FIXED | Progress endpoint returns rejectionReason |
| 34 | Billing journey-breakdown 400 | ✅ FIXED | Added defaults/coercion to validation schema |

---

## Testing Checklist

### Critical Path (Must Pass)

- [ ] Upload single file → Preview shows
- [ ] Upload multiple files → Joined preview shows
- [ ] Mark PII columns → Columns hidden and stay hidden after refresh
- [ ] Enter questions in prepare → Questions appear in transformation step
- [ ] Execute transformations → Data saved to dataset
- [ ] Generate analysis plan → Plan loads within 45 seconds
- [ ] Execute analysis → Results include question answers
- [ ] View results → Evidence chain links to original questions

### Regression Tests

```bash
# Run user journey tests
npm run test:user-journeys

# Run backend unit tests
npm run test:backend

# Run full E2E suite
npm run test
```

---

## Documentation References

| Document | Purpose | Location |
|----------|---------|----------|
| CLAUDE.md | Main AI assistant reference | Root |
| docs/ARCHITECTURE.md | System architecture | docs/ |
| docs/AGENTIC_SYSTEM.md | Agent system details | docs/ |
| docs/USER_JOURNEYS.md | User flow documentation | docs/ |
| PROJECT_DASHBOARD_ISSUES_AND_FIXES.md | Detailed fix history | Root |
| COMPREHENSIVE_GAP_ANALYSIS_DEC_14.md | Pipeline analysis | Root |

---

## How to Add New Issues

1. Assign next sequential issue number
2. Categorize: Data | Requirements | Analysis | UI | Backend | Billing
3. Set severity: CRITICAL | HIGH | MEDIUM | LOW
4. Document root cause and recommended fix
5. Update this tracker when fixed

---

**Maintained by**: Development Team
**Review Frequency**: After each development session
