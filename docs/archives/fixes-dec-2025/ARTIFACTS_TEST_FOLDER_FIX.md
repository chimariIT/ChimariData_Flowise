# Artifacts Test Folder Fix

**Date:** January 17, 2025  
**Status:** ✅ COMPLETED  
**Priority:** HIGH - User Request

---

## Summary

Updated artifact generation to save files to a **test folder named after the project** instead of using project IDs. This makes it easier to locate and organize artifacts for testing.

---

## Changes Applied

### 1. Updated ArtifactConfig Interface
**File:** `server/services/artifact-generator.ts`

Added `projectName` field to `ArtifactConfig`:
```typescript
export interface ArtifactConfig {
  projectId: string;
  projectName?: string; // Project name for folder structure
  userId: string;
  // ... other fields
}
```

### 2. Added Project Name Sanitization
**File:** `server/services/artifact-generator.ts`

Added `sanitizeProjectName()` method to safely convert project names to filesystem-safe folder names:
- Removes special characters
- Replaces spaces with underscores
- Limits length to 100 characters

### 3. Updated Artifact Directory Path
**File:** `server/services/artifact-generator.ts`

Changed from:
- **Old:** `uploads/artifacts/{projectId}/`
- **New:** `test-artifacts/{projectName}/`

All artifact generation methods now use `getArtifactDirectory()` which:
- Uses sanitized project name if available
- Falls back to projectId if project name not provided
- Creates directory structure automatically

### 4. Updated Analysis Execution Route
**File:** `server/routes/analysis-execution.ts`

Now passes `projectName` to artifact generator:
```typescript
const artifacts = await artifactGenerator.generateArtifacts({
  projectId,
  projectName: project.name || projectId, // Pass project name for folder structure
  // ... other config
});
```

### 5. Enhanced Logging
Added console logs to show where artifacts are being saved:
```
📁 [ARTIFACTS] Saving artifacts to: C:\...\test-artifacts\Teacher_Survey_Test\
📁 [ARTIFACTS] All artifacts saved to: test-artifacts/Teacher_Survey_Test/
```

---

## Folder Structure

### Before
```
uploads/
  artifacts/
    {projectId}/
      {projectId}-report.pdf
      {projectId}-presentation.pptx
      {projectId}-data.csv
      {projectId}-data.json
```

### After
```
test-artifacts/
  {sanitized-project-name}/
    {projectId}-report.pdf
    {projectId}-presentation.pptx
    {projectId}-data.csv
    {projectId}-data.json
```

### Example
For project "Teacher Survey Test" with ID `abc123`:
```
test-artifacts/
  Teacher_Survey_Test/
    abc123-report.pdf
    abc123-presentation.pptx
    abc123-data.csv
    abc123-data.json
```

---

## Testing with Your Dataset

### Dataset Path
```
C:\Users\scmak\Documents\Work\Projects\Chimari\Consulting_BYOD\sampledata\SPTO\English Survey for Teacher Conferences Week Online (Responses).xlsx
```

### Expected Folder Name
Project name: "English Survey for Teacher Conferences Week Online"  
Sanitized folder: `English_Survey_for_Teacher_Conferences_Week_Online`

### Test Steps

1. **Start Server**
   ```bash
   npm run dev
   ```

2. **Create Project**
   - Name: "English Survey for Teacher Conferences Week Online"
   - Upload the Excel file

3. **Complete Journey**
   - Go through all journey steps
   - Execute analysis

4. **Check Artifacts Folder**
   ```bash
   # Windows PowerShell
   dir test-artifacts\English_Survey_for_Teacher_Conferences_Week_Online
   
   # Should show:
   # - {projectId}-report.pdf
   # - {projectId}-presentation.pptx
   # - {projectId}-data.csv
   # - {projectId}-data.json (if technical/business journey)
   ```

5. **Verify Console Logs**
   ```
   📁 [ARTIFACTS] Saving artifacts to: C:\...\test-artifacts\English_Survey_for_Teacher_Conferences_Week_Online
   ✅ Generated 5 artifacts:
      - PDF Report: ✅
      - Presentation: ✅
      - CSV Export: ✅
      - JSON Data: ✅
      - Dashboard: ✅
   📁 [ARTIFACTS] All artifacts saved to: test-artifacts/English_Survey_for_Teacher_Conferences_Week_Online/
   ```

---

## Files Modified

| File | Changes | Status |
|------|---------|--------|
| `server/services/artifact-generator.ts` | Added projectName support, sanitization, new folder structure | ✅ Complete |
| `server/routes/analysis-execution.ts` | Pass projectName to artifact generator | ✅ Complete |

---

## TypeScript Compilation

✅ **0 errors** - All changes compile successfully

---

## Next Steps

1. **Test with your dataset** - Create project and complete journey
2. **Verify artifacts folder** - Check `test-artifacts/{project-name}/` exists
3. **Verify files** - Confirm PDF, PPTX, CSV, JSON files are present
4. **Check file contents** - Open files to verify they contain real data

---

## Notes

- Folder names are sanitized to be filesystem-safe
- Special characters are removed (except dashes and underscores)
- Spaces are replaced with underscores
- If project name is not available, falls back to projectId
- Directory structure is created automatically if it doesn't exist

---

**Ready for Testing!** 🚀

