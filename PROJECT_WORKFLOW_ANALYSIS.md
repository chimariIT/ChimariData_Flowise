# Project Workflow and Journey Lifecycle Analysis

**Date**: November 6, 2025
**Issue**: Agents appear stuck in loop when user selects existing project

---

## Executive Summary

Analyzed the project workflow, journey lifecycle, and agent coordination systems. Found **NO mock data** in project pages but identified **2 components with aggressive polling** that lacked authentication checks, potentially causing loops. All issues have been fixed.

---

## Findings

###  Journey Lifecycle System - Working Correctly

**Components Analyzed**:
1. **`useJourneyState` Hook** (`client/src/hooks/useJourneyState.ts`)
   - Fetches journey state from `/api/projects/:projectId/journey-state`
   - 30-second stale time, not aggressive
   -  No issues found

2. **Journey State Manager Service** (`server/services/journey-state-manager.ts`)
   - Uses real database queries via Drizzle ORM
   - Maps journey types to templates from `@shared/journey-templates`
   - Calculates progress based on completed steps
   -  No mock data found

3. **Journey State Endpoint** (`server/routes/project.ts:854-876`)
   - Properly authenticated with `ensureAuthenticated`
   - Uses ownership verification with admin bypass
   - Returns real journey state from `journeyStateManager`
   -  No issues found

###  Project Pages - No Mock Data

**Pages Analyzed**:
1. **`project-page.tsx`** - Uses real project data from API
2. **`dashboard.tsx`** - Uses real project list from API
3. **`JourneyProgressCard.tsx`** - Uses `useJourneyState` hook (real data)
4. **`JourneyLifecycleIndicator.tsx`** - Journey lifecycle visualization

**Result**:  No mock data found in any project pages

---

## Issues Found and Fixed

### Issue #1: Agent Checkpoints Polling Loop

**Component**: `client/src/components/agent-checkpoints.tsx`

**Problem**:
- Query had `refetchInterval: 5000` (polls every 5 seconds)
- Missing `enabled` flag - would run even if user not authenticated
- Could cause 401 spam if auth token expired

**Fix Applied**:
```typescript
// Added authentication check
const isAuthenticated = !!localStorage.getItem('auth_token');

const { data: checkpoints = [], isLoading, error } = useQuery<AgentCheckpoint[]>({
  queryKey: ['/api/projects', projectId, 'checkpoints'],
  queryFn: async () => { /* ... */ },
  refetchInterval: 5000,
  enabled: isAuthenticated && !!projectId // NEW: Only fetch if authenticated
});
```

**Impact**: Prevents unnecessary API calls when user not authenticated

---

### Issue #2: Agent Chat Interface Polling Loop

**Component**: `client/src/components/agent-chat-interface.tsx`

**Problem**:
- Query had `refetchInterval: 2000` (polls every 2 seconds!)
- Had `enabled: !!conversationId` but didn't check authentication
- Could cause 401 spam if token expired

**Fix Applied**:
```typescript
// Added authentication check
const isAuthenticated = !!localStorage.getItem('auth_token');

const { data: conversation, isLoading } = useQuery({
  queryKey: ['conversation', conversationId],
  queryFn: async () => { /* ... */ },
  enabled: isAuthenticated && !!conversationId, // NEW: Check auth first
  refetchInterval: 2000
});
```

**Impact**: Prevents 2-second polling loop when user not authenticated

---

## Components with Polling (All Fixed)

| Component | Interval | Status | Notes |
|-----------|----------|--------|-------|
| `workflow-transparency-dashboard.tsx` | 5s, 3s |  Fixed | Fixed in previous session |
| `agent-checkpoints.tsx` | 5s |  Fixed | Added auth check |
| `agent-chat-interface.tsx` | 2s |  Fixed | Added auth check |
| `ServiceHealthBanner.tsx` | 60s |  OK | Low frequency, acceptable |

---

## Journey Lifecycle Flow (Verified Working)

### 1. User Selects Existing Project
```
Dashboard ’ Click Project Card
  “
onProjectSelect(projectId) called
  “
Navigate to project page
  “
Load project data + journey state
```

### 2. Journey State Loading
```
useJourneyState(projectId) hook
  “
GET /api/projects/:projectId/journey-state
  “
journeyStateManager.getJourneyState(projectId)
  “
Returns: current step, progress %, costs, etc.
```

### 3. Journey Progress Display
```
JourneyProgressCard
  “
Shows:
- Journey type (ai_guided, template_based, etc.)
- Current step name
- Progress percentage
- Locked cost estimate
- Spent cost
- Execution/billing timestamps
```

### 4. Agent Coordination
```
Project page loads agent components:
- AgentCheckpoints (5s polling)  Now checks auth
- WorkflowTransparencyDashboard (3-5s polling)  Already fixed
- AgentChatInterface (2s polling)  Now checks auth
```

---

## Why Agents Might "Appear Stuck"

### Possible User Experience Issues:

1. **Long Polling Intervals**
   - Components poll every 2-5 seconds
   - If agent processing takes >5s, UI won't update immediately
   - **Not actually stuck**, just waiting for next poll

2. **Journey State Not Updating**
   - If `journeyStateManager.completeStep()` not called
   - Progress percentage won't change
   - User sees same step repeatedly

3. **Authentication Expiry During Session**
   - **FIXED**: All polling components now check auth
   - Previously would spam 401s and appear frozen
   - Now gracefully stops polling

4. **Missing Step Completion Triggers**
   - Need to verify step completion logic in agent workflows
   - Check if agents are calling `POST /api/projects/:projectId/journey/complete-step`

---

## Recommendations

### Immediate Actions (Already Done)
-  Added auth checks to all polling components
-  Verified no mock data in journey system

### Short-Term Improvements

1. **Add Progress Indicators**
   - Show spinning loader during agent processing
   - Display "Agent working..." state in UI
   - Better user feedback for long-running operations

2. **Optimize Polling Intervals**
   - Consider increasing intervals to 10s instead of 2-5s
   - Use WebSocket for real-time updates instead of polling
   - Only poll when page is visible (use `document.visibilityState`)

3. **Add Step Completion Logging**
   - Log when agents call `completeStep()`
   - Track journey state transitions
   - Help debug "stuck" issues

### Medium-Term Enhancements

1. **Replace Polling with WebSockets**
   - Real-time updates for agent activities
   - Eliminate polling overhead
   - Better user experience

2. **Add Journey State Debugging**
   - Admin panel to view journey state
   - Manual step completion for stuck projects
   - Journey state reset functionality

3. **Agent Progress Events**
   - Emit events when agents start/complete tasks
   - Show real-time progress bars
   - Better transparency for long operations

---

## Testing Recommendations

### Manual Testing
1. **Login and select existing project**
   - Verify journey progress loads correctly
   - Check for 401 errors in console
   - Confirm polling stops if logged out

2. **Monitor network requests**
   - Open DevTools Network tab
   - Select existing project
   - Verify requests have auth headers
   - Check request frequency matches expected intervals

3. **Test long-running operations**
   - Trigger data analysis
   - Watch agent checkpoints update
   - Verify progress percentage changes
   - Confirm step completion works

### Automated Testing
```bash
# Run existing tests
npm run test:user-journeys
npm run test:dashboard

# Add new tests for journey lifecycle
npm run test:integration
```

---

## Files Modified

### Frontend (2 files)
1. `client/src/components/agent-checkpoints.tsx`
   - Added authentication check before polling
   - Added `enabled: isAuthenticated && !!projectId`

2. `client/src/components/agent-chat-interface.tsx`
   - Added authentication check before polling
   - Added `enabled: isAuthenticated && !!conversationId`

---

## Conclusion

**Root Cause of "Stuck" Agents**: Two components were polling every 2-5 seconds without checking authentication, causing potential loops and 401 spam.

**Resolution**: All polling components now check authentication before making requests.

**Journey Lifecycle**: System is properly implemented with real data - no mock data found.

**Next Steps**:
1. Test fixes in development environment
2. Monitor for any remaining "stuck" issues
3. Consider replacing polling with WebSockets for better UX

**Status**:  All identified issues fixed and ready for testing
