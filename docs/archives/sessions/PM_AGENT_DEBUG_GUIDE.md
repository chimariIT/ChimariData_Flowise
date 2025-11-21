# PM Agent Clarification - Debugging Guide

**Issue**: Getting error "Failed to get PM Agent clarification. Please try again."

---

## ✅ Fixes Applied

1. **Backend**: Fixed parameter mismatch - now accepts `analysisGoal`, `sessionId`, `businessQuestions`, `journeyType`
2. **Frontend**: Added detailed error logging to show actual error messages

---

## 🔍 How to Debug

### Step 1: Open Browser Developer Tools

1. Open your browser (Chrome/Edge)
2. Press **F12** to open Developer Tools
3. Go to the **Console** tab

### Step 2: Try the PM Agent Clarification Again

1. Fill in your analysis goal
2. Add some business questions
3. Click "Get PM Agent Clarification"
4. **Watch the Console tab**

### Step 3: Look for These Log Messages

You should now see detailed logs:

```
PM Clarification Response Status: 200 OK
PM Clarification Response Data: { ... }
```

Or if it fails:

```
PM Clarification Response Status: 400 Bad Request
PM Clarification Error Response: { error: "..." }
Error details: { message: "...", ... }
```

---

## 🎯 Common Errors & Solutions

### Error 1: "Server returned 404: Not Found"

**Cause**: The API endpoint doesn't exist or route isn't registered

**Solution**:
1. Check server is running: `npm run dev`
2. Verify route is registered in `server/routes/index.ts` line 76:
   ```typescript
   router.use('/project-manager', ensureAuthenticated, pmClarificationRouter);
   ```

### Error 2: "Server returned 400: Bad Request"

**Cause**: Missing required fields or validation error

**Check Console For**:
```json
{
  "error": "Goal or analysisGoal is required"
}
```

**Solution**: Make sure you've entered an analysis goal before clicking the button

### Error 3: "Server returned 401: Unauthorized"

**Cause**: Not authenticated

**Solution**:
1. Make sure you're logged in
2. Check for auth token in browser cookies or localStorage
3. Try logging out and back in

### Error 4: "Server returned 500: Internal Server Error"

**Cause**: Server-side error (code bug)

**Check Server Logs For**:
```
PM Agent clarification error: [error details]
```

**Solution**: Check the terminal where you ran `npm run dev` for error stack traces

### Error 5: "Failed to fetch" or "Network Error"

**Cause**: Server not running or network issue

**Solution**:
1. Check if server is running: `npm run dev`
2. Check server started successfully and is listening on port 5000
3. Look for this message in terminal:
   ```
   Server listening on port 5000
   ```

---

## 🧪 Manual Test

I've created a test script. Run this while the server is running:

```bash
node test-pm-clarification.js
```

This will:
1. Test the endpoint directly
2. Show the request being sent
3. Show the response received
4. Display any errors

**Expected Output (Success)**:
```
✅ SUCCESS!

Response Data: {
  "success": true,
  "type": "summary",
  "clarification": {
    "summary": "Your analysis goal is: ...",
    "suggestedFocus": "...",
    "dataRequirements": [...],
    "estimatedComplexity": "moderate"
  }
}
```

**Expected Output (Server Not Running)**:
```
❌ REQUEST FAILED!

Error: fetch failed
Details: FetchError: request to http://localhost:5000/... failed

💡 Possible Issues:
  1. Server not running on port 5000
  ...
```

---

## 📋 Debugging Checklist

Run through this checklist:

- [ ] **Server Running**: Run `npm run dev` in terminal
- [ ] **Port Correct**: Check server is on port 5000 (or update test URL)
- [ ] **Logged In**: Make sure you're authenticated in the browser
- [ ] **Console Open**: Have browser DevTools Console open
- [ ] **Try Again**: Click "Get PM Agent Clarification" button
- [ ] **Read Logs**: Check console logs for detailed error
- [ ] **Check Network**: Go to Network tab, filter "clarify", check request/response

---

## 🔧 What Changed in the Code

### Frontend Enhancement (`client/src/pages/prepare-step.tsx:604-653`)

**Before** (generic error):
```typescript
} catch (error: any) {
  console.error('Clarification failed:', error);
  alert('Failed to get PM Agent clarification. Please try again.');
}
```

**After** (detailed error):
```typescript
} catch (error: any) {
  console.error('Clarification failed:', error);
  console.error('Error details:', {
    message: error.message,
    stack: error.stack,
    analysisGoal,
    businessQuestions,
    journeyType
  });
  alert(`Failed to get PM Agent clarification: ${error.message}\n\nCheck browser console for details.`);
}
```

**Added Logging**:
```typescript
console.log('PM Clarification Response Status:', response.status, response.statusText);

if (!response.ok) {
  const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
  console.error('PM Clarification Error Response:', errorData);
  throw new Error(errorData.error || `Server returned ${response.status}: ${response.statusText}`);
}

const data = await response.json();
console.log('PM Clarification Response Data:', data);
```

### Backend Enhancement (`server/routes/pm-clarification.ts`)

**Fixed**: Now accepts the exact fields the frontend sends:
```typescript
const {
  goal,
  analysisGoal,      // ✅ Frontend field
  projectId,
  sessionId,         // ✅ Frontend field
  step,
  userResponse,
  businessQuestions, // ✅ Frontend field
  journeyType        // ✅ Frontend field
} = req.body;

const userGoal = goal || analysisGoal; // Accept either
```

---

## 🎯 Next Steps

1. **Restart the app**:
   ```bash
   npm run dev
   ```

2. **Open browser DevTools** (F12)

3. **Try PM Agent Clarification** again

4. **Copy the console output** and share it with me

You should now see one of these:

✅ **Success**: Clarification dialog opens with data

❌ **Detailed Error**: Console shows exactly what went wrong (HTTP status, error message, etc.)

Share the console output with me and I can help fix the specific issue!

---

## 📞 Support

If you're still stuck, provide:
1. **Console logs** (all red errors and the blue `console.log` outputs)
2. **Network tab** (screenshot of the `clarify-goal` request)
3. **Server logs** (any errors in the terminal where you ran `npm run dev`)

This will help me identify the exact issue.
