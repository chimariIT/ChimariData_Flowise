# Server Restart Guide - Apply Latest Fixes

**Date**: October 27, 2025
**Issue**: Server is running old code - needs restart to apply fixes
**Current Server PID**: 7896 (port 5000)

---

## Problem

The code files have all the fixes applied, but the development server is running old code. You're seeing:
- ❌ PM clarification questions are generic (not contextual)
- ❌ Changes not taking effect

**Root Cause**: Development server hasn't been restarted since code changes were made.

---

## Solution: Restart Development Server

### Step 1: Stop Current Server

**Option A: Use Terminal Where Server is Running**
1. Find the terminal/command prompt where you ran `npm run dev`
2. Press `Ctrl+C` to stop the server
3. Wait for "Server stopped" message

**Option B: Kill Process Manually**
```powershell
# Kill the process using port 5000
taskkill /PID 7896 /F

# Or kill all node processes (more aggressive)
taskkill /IM node.exe /F
```

### Step 2: Start Server with Latest Code

```bash
# Navigate to project directory
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2

# Start development server
npm run dev
```

### Step 3: Wait for Server to Initialize

Look for these messages in the console:
```
✅ Initialized [X] agents:
  - Data Engineer Agent
  - Data Scientist Agent
  - Business Agent
  - Project Manager Agent
  - Technical AI Agent

✅ Tools and agents initialized
🚀 Server running on http://localhost:5000
```

### Step 4: Verify Fixes are Active

**Test PM Clarification**:
```bash
curl -X POST http://localhost:5000/api/project-manager/clarify-goal -H "Content-Type: application/json" -d "{\"analysisGoal\":\"Analyze teacher satisfaction with conference programs\",\"businessQuestions\":[\"Which programs are most popular?\"],\"journeyType\":\"business\"}"
```

**Expected**: Questions should now reference your specific goal:
- `For your goal of "Analyze teacher satisfaction..."` ✅
- NOT generic `What time period should this analysis cover?` ❌

**Check Server Logs**:
```
✅ PM Agent: Generated AI-powered clarifying questions
```
OR
```
⚠️  PM Agent: GOOGLE_AI_API_KEY not set - using contextual fallback questions
```

---

## What to Watch For After Restart

### 1. PM Agent Clarification

**Before Restart**:
```
"clarifyingQuestions":[
  {"question":"What time period should this analysis cover?","reason":"..."},
  {"question":"Are there any specific constraints?","reason":"..."}
]
```

**After Restart (Expected)**:
```
"clarifyingQuestions":[
  {"question":"For your goal of 'Analyze teacher satisfaction...', what specific metrics would indicate success?","reason":"..."},
  {"question":"What time period should we analyze for 'education analysis'?","reason":"..."},
  {"question":"Are there specific business rules or constraints for education analysis?","reason":"..."}
]
```

### 2. Execute Step

**Before Restart**:
```
❌ Analysis failed: Authentication required
```

**After Restart (Expected)**:
```
✅ Analysis executing...
✅ Analysis completed successfully
```

### 3. Data Transformation

**Before Restart**:
```
❌ Section not visible in Data step
```

**After Restart (Expected)**:
```
✅ "Review & Transform Data (Optional)" section appears
✅ Can expand and use transformation tools
```

---

## Troubleshooting

### If Server Won't Start

**Error**: `EADDRINUSE: Port 5000 is already in use`

**Solution**:
```powershell
# Find process using port 5000
netstat -ano | findstr ":5000"

# Kill the process (replace PID with actual number)
taskkill /PID [PID] /F

# Try starting again
npm run dev
```

### If Changes Still Don't Appear

1. **Hard reload browser**: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. **Clear browser cache**
3. **Check git status** to ensure changes are saved:
   ```bash
   git diff server/routes/pm-clarification.ts
   git diff client/src/pages/execute-step.tsx
   git diff client/src/pages/data-step.tsx
   ```

### If PM Clarification Still Generic

1. **Check server logs** for one of these:
   - `✅ PM Agent: Generated AI-powered clarifying questions` (AI working)
   - `⚠️  PM Agent: using contextual fallback` (Fallback but should be contextual)
   - `❌ PM Agent: AI API error` (AI failed, using fallback)

2. **If AI is failing**, verify:
   ```bash
   # Check if API key is set
   findstr GOOGLE_AI_API_KEY .env
   ```

3. **If fallback questions are still not contextual**, check the actual code:
   ```bash
   # Should show contextual questions with ${subject}
   findstr "What time period should we analyze for" server/routes/pm-clarification.ts
   ```

---

## Data Agent and Edit Schema Issues

These issues were mentioned but need investigation. After restarting:

### Data Agent Not Available

**Check**:
1. Open browser console (F12)
2. Navigate to Data step
3. Look for errors related to "Data Agent" or "DataEngineerAgent"
4. Check network tab for failed API calls

**Possible Causes**:
- Agent not initialized on server
- Frontend trying to access agent that doesn't exist
- Permission/authentication issue

### Edit Schema Error

**Check**:
1. Navigate to where "Edit Schema" button appears
2. Click the button
3. Note the exact error message
4. Check browser console for detailed error

**Possible Causes**:
- Schema editor component not loading
- Missing schema data
- API endpoint not found
- Validation error

---

## Quick Validation Checklist

After restarting server, test these:

- [ ] **Server starts without errors**
- [ ] **All agents initialized** (check console logs)
- [ ] **PM clarification returns contextual questions**
- [ ] **Execute step doesn't throw auth error**
- [ ] **Data transformation UI appears in Data step**
- [ ] **Browser can connect to http://localhost:5000**

---

## Expected Files Modified

When you check `git status`, you should see:

```
modified:   client/src/pages/execute-step.tsx
modified:   client/src/pages/data-step.tsx
modified:   server/routes/pm-clarification.ts
```

If these don't show as modified, the changes weren't saved.

---

## Next Steps After Restart

1. ✅ **Test PM Clarification**
   - Enter specific goal
   - Check if questions reference your goal
   - Monitor server logs

2. ✅ **Test Execute Step**
   - Try running analysis
   - Verify no auth error
   - Check analysis completes

3. ✅ **Test Data Transformation**
   - Upload file
   - Look for transformation section
   - Try applying a transformation

4. ⚠️  **Investigate Data Agent Issue**
   - Share exact error message
   - Share browser console logs

5. ⚠️  **Investigate Edit Schema Error**
   - Share exact error message
   - Share what page/step shows the error

---

**Status**: Ready to restart server and test fixes
**Action Required**: Stop and restart `npm run dev`
