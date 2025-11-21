# Project Creation User ID Fix

**Date**: October 27, 2025  
**Status**: ✅ FIXED  
**Issue**: "null value in column 'user_id' of relation 'projects' violates not-null constraint"

---

## Problem Summary

The error "Upload failed: null value in column 'user_id' of relation 'projects' violates not-null constraint" occurred when creating projects because the database schema has both `user_id` and `owner_id` as NOT NULL fields, but the code was only setting `owner_id`.

### Root Cause

1. **Database Schema** (`shared/schema.ts:463-495`):
   - Both `userId` and `ownerId` are defined as NOT NULL
   - `userId` is the preferred field for user references
   - `ownerId` is kept for backward compatibility

2. **Missing Field Mapping** (`server/storage.ts:85-94`):
   - The `dataProjectToInsertProject` function was only setting `ownerId`
   - It was not setting `userId`, causing the database constraint violation

3. **Consultation Route** (`server/routes/consultation.ts:451-463`):
   - Directly inserts into database but only set `userId`
   - Missing `ownerId` field

4. **Authentication Middleware** (`server/routes/auth.ts:299-350`):
   - Not ensuring `req.userId` is always set when session is authenticated
   - Fallback handling was incomplete

---

## Changes Made

### 1. Fixed `dataProjectToInsertProject` Function
**File**: `server/storage.ts:85-94`

**Before**:
```typescript
function dataProjectToInsertProject(dataProject: InsertDataProject): Omit<InsertProject, 'id'> {
  const owner = (dataProject as any).userId ?? (dataProject as any).ownerId;
  return {
    ownerId: owner,  // Only set ownerId
    name: dataProject.name,
    description: dataProject.description || null,
    journeyType: (dataProject as any).journeyType || 'ai_guided',
  };
}
```

**After**:
```typescript
function dataProjectToInsertProject(dataProject: InsertDataProject): Omit<InsertProject, 'id'> {
  const owner = (dataProject as any).userId ?? (dataProject as any).ownerId;
  return {
    userId: owner,      // ✅ Set userId (required by schema)
    ownerId: owner,    // ✅ Set ownerId (required for backward compatibility)
    name: dataProject.name,
    description: dataProject.description || null,
    journeyType: (dataProject as any).journeyType || 'ai_guided',
  };
}
```

### 2. Updated Validation in `DatabaseStorage.createProject`
**File**: `server/storage.ts:971-986`

**Before**:
```typescript
const insertData = dataProjectToInsertProject(projectData);
if (!insertData.ownerId) {
  throw new Error('createProject: ownerId/userId is required');
}
```

**After**:
```typescript
const insertData = dataProjectToInsertProject(projectData);
if (!insertData.ownerId || !insertData.userId) {
  throw new Error('createProject: ownerId and userId are required');
}
```

### 3. Fixed Consultation Route Direct Insert
**File**: `server/routes/consultation.ts:451-464`

**Before**:
```typescript
const [newProject] = await db.insert(projects).values({
  id: projectId,
  userId,
  name: `Consultation: ${request.challenge.substring(0, 50)}`,
  // ... other fields
});
```

**After**:
```typescript
const [newProject] = await db.insert(projects).values({
  id: projectId,
  userId,
  ownerId: userId, // ✅ Set ownerId for backward compatibility
  name: `Consultation: ${request.challenge.substring(0, 50)}`,
  // ... other fields
});
```

### 4. Enhanced Authentication Middleware
**File**: `server/routes/auth.ts:299-350`

**Changes**:
- Added explicit check to ensure `req.userId` is set when `req.user` exists
- Improved error handling for session authentication
- Better logging for debugging authentication issues

**Key Addition**:
```typescript
if (req.user) {
  // Ensure userId is also set
  if (!req.userId && (req.user as any)?.id) {
    req.userId = (req.user as any).id;
  }
  return next();
}
```

---

## Validation

### ✅ Schema Compliance
- Both `userId` and `ownerId` are now set in all project creation paths
- Database constraint satisfied

### ✅ Backward Compatibility
- `ownerId` maintained for legacy compatibility
- `userId` uses same value as `ownerId`

### ✅ All Project Creation Endpoints
1. **POST /api/projects** - Fixed via `dataProjectToInsertProject`
2. **POST /api/projects/upload** - Fixed via `dataProjectToInsertProject`
3. **POST /api/consultation/:id/upload-data** - Fixed direct insert
4. **POST /api/custom-journey** - Already had both fields
5. **HybridStorage.createProject** - Uses `dataProjectToInsertProject`

---

## Testing Steps

### Manual Test Plan

1. **Create Project via Journey Wizard**:
   ```bash
   # Start server
   npm run dev
   
   # Navigate to http://localhost:5000/journeys/ai_guided/prepare
   # Fill in project details and create project
   # Expected: Project created successfully
   ```

2. **Upload File with Project Creation**:
   ```bash
   # Go to http://localhost:5000/journeys/business/data
   # Click "Upload File"
   # Select an Excel/CSV file
   # Expected: File uploads and project created without errors
   ```

3. **Verify Database**:
   ```sql
   SELECT id, "userId", "ownerId", name, "journeyType" 
   FROM projects 
   ORDER BY "createdAt" DESC 
   LIMIT 5;
   ```
   
   Expected: Both `userId` and `ownerId` are set and match

---

## Production Readiness

### ✅ Completed
- Fixed null constraint violation
- All project creation paths updated
- Authentication middleware improved
- Backward compatibility maintained

### ⚠️ Additional Validation Needed
1. End-to-end testing with real users
2. Verify OAuth flows set both fields correctly
3. Test with different authentication providers
4. Validate multi-tenant scenarios

### 📝 Known Linter Issues (Unrelated)
- `server/routes/admin-service-pricing.ts:64` - Existing error, not related to this fix

---

## Files Modified

1. `server/storage.ts` - Fixed field mapping
2. `server/routes/auth.ts` - Enhanced authentication
3. `server/routes/consultation.ts` - Fixed direct insert
4. `PROJECT_CREATION_USER_ID_FIX.md` - This document

---

## Related Issues

- **AGENT_WORKFLOW_E2E_AUDIT.md** - Test validation guide
- **VALIDATION_RESULTS.md** - PM Agent validation
- **PM_CLARIFICATION_FIX_COMPLETE.md** - PM Agent fixes

---

## Next Steps

1. ✅ **Run manual tests** to verify fix works
2. ✅ **Test file upload** functionality
3. ✅ **Test different journey types** (ai_guided, business, technical, consultation)
4. ✅ **Monitor for any remaining authentication issues**
5. ✅ **Run production test suite** before deployment

---

**Fix Status**: ✅ Ready for testing
**Breaking Changes**: None
**Backward Compatibility**: Maintained


