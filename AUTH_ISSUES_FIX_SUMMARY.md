# Auth & Console Issues - Fix Summary

## Issues Identified & Fixed

### 1. ✅ React Query Missing queryFn
**Problem**: `DatasetSelector.tsx` had queries without `queryFn`, causing immediate failures.

**Fix**: Added proper `queryFn` to both queries:
- `/api/datasets` query now uses `apiClient.getDatasets()`
- `/api/projects/:id/datasets` query now uses `apiClient.getProjectDatasets()`

### 2. ✅ Authentication Error Handling
**Problem**: `getCurrentUser()` was throwing errors instead of gracefully handling missing/invalid tokens.

**Fix**: 
- Changed `getCurrentUser()` to return `null` instead of throwing when no token
- Added try-catch to clear invalid/expired tokens
- Improved error handling in `App.tsx` to handle token expiration gracefully

### 3. ⚠️ Missing Endpoints (404s)
**Note**: These endpoints don't exist yet but are called:
- `/api/streaming-sources` - Not implemented
- `/api/scraping-jobs` - Not implemented

These are expected 404s if the features aren't implemented yet. The calls should be wrapped in try-catch or disabled queries if features aren't available.

### 4. ⚠️ WebSocket Authentication
**Issue**: JWT in WebSocket URL expires, causing connections to close.

**Recommendation**: Need to implement WebSocket token refresh mechanism or use session-based auth for WebSockets.

## Files Modified

1. ✅ `client/src/components/DatasetSelector.tsx` - Added queryFn to React Query hooks
2. ✅ `client/src/lib/api.ts` - Improved `getCurrentUser()` error handling
3. ✅ `client/src/App.tsx` - Improved auth status check error handling

## Testing Checklist

- [ ] Test login flow - should not show "No valid authentication" error
- [ ] Test DatasetSelector - should load datasets without React Query warnings
- [ ] Test token expiration - should gracefully handle expired tokens
- [ ] Verify 401 errors are now handled properly
- [ ] Check WebSocket connection (may need additional fixes)

