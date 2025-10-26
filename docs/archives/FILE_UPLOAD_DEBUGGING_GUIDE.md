# File Upload Debugging Guide

**Date:** October 13, 2025
**Issue:** File upload still failing after endpoint path fix
**Status:** 🔧 **DEBUGGING ENHANCEMENTS ADDED**

---

## New Fixes Implemented

### Fix #1: Added Authentication Token to Upload Request

**Problem:** The upload request wasn't sending the authentication token, even though the endpoint requires authentication.

**File:** `client/src/pages/data-step.tsx`

**Changes:**
```typescript
// BEFORE - No auth token
const response = await fetch('/api/projects/upload', {
  method: 'POST',
  credentials: 'include',
  body: formData
});

// AFTER - Auth token added
const token = localStorage.getItem('auth_token');
const headers: any = {};

if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}

const response = await fetch('/api/projects/upload', {
  method: 'POST',
  headers: headers,  // ← Added auth header
  credentials: 'include',
  body: formData
});
```

---

### Fix #2: Pre-Upload Authentication Check

**Added early validation to prevent upload attempts without authentication:**

```typescript
const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  // ✅ NEW: Check if user is authenticated
  const token = localStorage.getItem('auth_token');
  if (!token) {
    alert('Please log in to upload files. Authentication is required.');
    setUploadStatus('error');
    return;
  }

  // Continue with upload...
}
```

---

### Fix #3: Enhanced Error Messages

**Improved error handling with specific messages for different failure scenarios:**

```typescript
if (!response.ok) {
  let errorMessage = `Upload failed: ${response.statusText}`;
  
  try {
    const errorData = await response.json();
    errorMessage = errorData.error || errorMessage;
  } catch (e) {
    // If response is not JSON, use status text
  }
  
  // ✅ Specific error messages
  if (response.status === 401) {
    errorMessage = 'Authentication required. Please log in to upload files.';
  } else if (response.status === 403) {
    errorMessage = 'Permission denied. You do not have access to upload files.';
  }
  
  throw new Error(errorMessage);
}
```

---

### Fix #4: Comprehensive Debug Logging

**Added detailed console logs to track upload process:**

```typescript
// Log auth status
if (token) {
  console.log('✓ Auth token found and added to request');
} else {
  console.warn('⚠️ No auth token found in localStorage');
}

// Log request details
console.log('📡 Making request to: /api/projects/upload');

// Log response
console.log(`📥 Response status: ${response.status} ${response.statusText}`);

// Log errors with full details
console.error('❌ Upload error:', error);
console.error('❌ Error details:', {
  message: error.message,
  stack: error.stack
});
```

---

## Debugging Checklist

Use this checklist to diagnose upload failures:

### Step 1: Check Authentication ✓
```javascript
// Open browser console and run:
localStorage.getItem('auth_token')

// Should return a token string like: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
// If null → User is NOT logged in
```

**If null:**
- ✅ **Solution:** Log in first before uploading
- The registration/login should set this token automatically
- Check the auth.tsx login/register handler

---

### Step 2: Check Upload Logs 📋

**What to look for in browser console:**

✅ **Successful Upload:**
```
📤 Uploading file: mydata.csv
✓ Auth token found and added to request
📡 Making request to: /api/projects/upload
📥 Response status: 200 OK
✅ File uploaded successfully
📊 Records: 1523
```

❌ **Failed Upload (No Auth):**
```
📤 Uploading file: mydata.csv
⚠️ No auth token found in localStorage
📡 Making request to: /api/projects/upload
📥 Response status: 401 Unauthorized
❌ Upload error: Authentication required
```

❌ **Failed Upload (Wrong Endpoint):**
```
📤 Uploading file: mydata.csv
✓ Auth token found and added to request
📡 Making request to: /api/projects/upload
📥 Response status: 404 Not Found
❌ Upload error: Upload failed: Not Found
```

---

### Step 3: Check Server Logs 🖥️

**Backend should log:**

✅ **Successful:**
```
POST /api/projects/upload 200 - 1.234s
User authenticated: user_abc123
File processed: mydata.csv
Records: 1523
```

❌ **Failed (No Auth):**
```
POST /api/projects/upload 401 - 0.010s
Authentication failed: No valid authorization header
```

❌ **Failed (Invalid Token):**
```
POST /api/projects/upload 401 - 0.015s
Authentication failed: Invalid token
```

---

### Step 4: Verify Network Request 🌐

**In Browser DevTools → Network tab:**

1. Look for request to `/projects/upload`
2. Check **Request Headers:**
   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   Content-Type: multipart/form-data; boundary=...
   ```
3. Check **Request Payload:**
   ```
   ------WebKitFormBoundary...
   Content-Disposition: form-data; name="file"; filename="mydata.csv"
   Content-Type: text/csv
   
   [file content]
   ------WebKitFormBoundary...
   ```

**What to verify:**
- ✅ URL is `/api/projects/upload` (plural, not singular)
- ✅ Authorization header is present
- ✅ File is in request payload
- ✅ Status code is 200 (not 401, 404, or 500)

---

## Common Error Scenarios

### Error #1: "Authentication required"

**Cause:** No auth token in localStorage

**Solution:**
1. Log in/register first
2. Check that login/register saves token:
   ```javascript
   localStorage.setItem('auth_token', token);
   ```
3. Verify token after login:
   ```javascript
   console.log(localStorage.getItem('auth_token'));
   ```

---

### Error #2: "Upload failed: Not Found" (404)

**Cause:** Wrong endpoint path

**Solution:**
1. Verify endpoint is `/api/projects/upload` (plural)
2. Check server routes are registered:
   ```typescript
   router.use('/projects', projectRouter);
   ```
3. Restart dev server if routes were changed

---

### Error #3: "Permission denied" (403)

**Cause:** User authenticated but lacks upload permissions

**Solution:**
1. Check user role/permissions in database
2. Verify upload endpoint doesn't have additional role checks
3. Check subscription tier allows uploads

---

### Error #4: "No file uploaded" (400)

**Cause:** File not properly attached to FormData

**Solution:**
1. Verify file input has `name="file"` attribute
2. Check FormData construction:
   ```javascript
   const formData = new FormData();
   formData.append('file', file); // ← Must be 'file'
   ```
3. Verify multer configuration expects `'file'`:
   ```typescript
   upload.single('file') // ← Matches FormData key
   ```

---

## Testing Instructions

### Manual Test Flow

**Step 1: Register/Login**
```
1. Go to http://localhost:5173 (or your dev server)
2. Click "Create Account" or "Sign In"
3. Fill in credentials
4. Submit form
5. ✅ Verify: You're redirected and logged in
6. ✅ Open console: localStorage.getItem('auth_token') should return a token
```

**Step 2: Navigate to Upload**
```
1. Click "Start New Project" or navigate to data upload
2. ✅ Verify: You see the file upload interface
```

**Step 3: Upload File**
```
1. Click "Choose File" or drag-and-drop
2. Select a CSV or Excel file
3. ✅ Watch console logs:
   - Should see "✓ Auth token found"
   - Should see "📡 Making request to: /api/projects/upload"
   - Should see "📥 Response status: 200 OK"
4. ✅ Verify: Upload progress bar fills
5. ✅ Verify: Success message appears
6. ✅ Verify: Real data stats shown (not hardcoded 2400 rows)
```

---

## Quick Fixes for Common Issues

### If Token Not Found:
```javascript
// Force re-login by clearing old session
localStorage.clear();
// Then log in again
```

### If Wrong Endpoint:
```javascript
// Check all API calls use correct path
grep -r "/api/project/" client/src/  # Should find nothing
grep -r "/api/projects/" client/src/ # Should find upload calls
```

### If Server Not Responding:
```bash
# Restart dev server
npm run dev

# Or kill and restart
taskkill /F /IM node.exe
npm run dev
```

---

## Code Locations

**Upload Logic:**
- `client/src/pages/data-step.tsx` - Lines 79-310
- `client/src/lib/api.ts` - Lines 51-120 (uploadFile method)

**Backend Endpoint:**
- `server/routes/project.ts` - Lines 210-280 (upload handler)
- `server/routes/index.ts` - Line 32 (route registration)

**Authentication:**
- `server/routes/auth.ts` - Lines 259-315 (ensureAuthenticated middleware)
- `client/src/pages/auth.tsx` - Lines 31-68 (login/register handler)

---

## Next Steps

1. **Test Upload with Debugging:**
   - Open browser console
   - Register/login
   - Attempt file upload
   - Share console output and error messages

2. **Verify Backend:**
   - Check server terminal for logs
   - Verify no errors during startup
   - Confirm routes are registered

3. **Check Database:**
   - Verify user exists after registration
   - Check auth token is valid
   - Confirm upload endpoint is accessible

---

## Status

✅ **Authentication token now sent with upload**
✅ **Early auth check prevents unauthorized uploads**
✅ **Enhanced error messages**
✅ **Comprehensive debug logging**
🔧 **Ready for testing**

**Next:** Try uploading again and share the console output for further debugging!
