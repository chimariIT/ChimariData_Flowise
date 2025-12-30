# Upload Authentication Debug Session

**Date**: November 6, 2025
**Issue**: File upload returns 401 Unauthorized despite user being authenticated
**Status**: 🔍 **DEBUGGING** - Added comprehensive logging to trace issue

---

## Problem Summary

User is authenticated (token exists and works for WebSocket connections) but file upload endpoint `/api/projects/upload` returns 401 Unauthorized.

**Console Evidence**:
```
POST http://localhost:5173/api/projects/upload [HTTP/1.1 401 Unauthorized 4ms]
Upload error: Error: Authentication required - Please sign in to upload files
```

**Key Observation**: Token works for WebSocket (visible in log line 10) but not for upload endpoint.

---

## Investigation History

### Phase 1: Verified Upload Endpoint Configuration
✅ Upload endpoint exists at `server/routes/project.ts:538`
✅ Has `ensureAuthenticated` middleware before handler
✅ Route properly registered in `server/routes/index.ts:51`

### Phase 2: Verified Client-Side Request Flow
✅ `apiClient.uploadFile()` calls `this.request()` (line 295)
✅ `request()` calls `buildAuthHeaders()` to add Authorization header (line 121)
✅ `buildAuthHeaders()` retrieves token from localStorage and adds `Authorization: Bearer <token>` (line 24)

### Phase 3: Identified Potential Issue
**Hypothesis**: Authorization header might not be reaching the server despite being added by client.

**Possible Causes**:
1. FormData requests sometimes have issues with custom headers in certain browsers
2. Middleware order issue (multer processing before auth check)
3. CORS preflight stripping headers
4. Proxy/reverse proxy removing headers

---

## Debug Logging Added

### Client-Side Debugging (`client/src/lib/api.ts`)

**Location 1: Before upload request (line 290-292)**
```typescript
const token = localStorage.getItem('auth_token');
console.log('🔍 Upload request - token exists:', !!token, 'token preview:', token?.substring(0, 20));
```

**Location 2: During header building (line 123-130)**
```typescript
if (url.includes('/upload')) {
  console.log('🔍 Building headers for upload:', {
    hasAuthInMerged: !!mergedHeaders['Authorization'],
    authPreview: mergedHeaders['Authorization']?.substring(0, 30),
    allHeaderKeys: Object.keys(mergedHeaders)
  });
}
```

**What to Look For**:
- Token exists: `true`
- Token preview: Should show first 20 chars of JWT
- hasAuthInMerged: `true`
- authPreview: Should show "Bearer eyJ..." (first 30 chars)
- allHeaderKeys: Should include "Authorization"

### Server-Side Debugging (`server/routes/auth.ts`)

**Location: ensureAuthenticated middleware (line 356-365)**
```typescript
if (req.path === '/upload' || req.url.includes('/upload')) {
  console.log('🔍 Upload request authentication check:', {
    path: req.path,
    url: req.url,
    hasAuthHeader: !!req.headers.authorization,
    authHeaderPreview: req.headers.authorization?.substring(0, 20),
    hasSession: !!req.isAuthenticated?.(),
    contentType: req.headers['content-type']?.substring(0, 50)
  });
}
```

**What to Look For**:
- hasAuthHeader: Should be `true` if header is reaching server
- authHeaderPreview: Should show "Bearer eyJ..." if header exists
- hasSession: Should be `false` (we're using Bearer token, not session)
- contentType: Should show "multipart/form-data; boundary=..."

---

## Testing Instructions

### Step 1: Restart Development Server
```bash
# Stop current server (Ctrl+C if running)
npm run dev
```

Wait for server to fully start before testing.

### Step 2: Test File Upload

1. Open browser and navigate to project page
2. Open browser DevTools Console (F12 → Console tab)
3. Attempt to upload a file
4. Capture console output

### Step 3: Check Server Logs

In your terminal running `npm run dev`, look for:
```
🔍 Upload request authentication check: {
  path: '/upload',
  url: '/upload',
  hasAuthHeader: ??? <-- This is critical
  authHeaderPreview: ??? <-- Should show "Bearer eyJ..."
  hasSession: ???,
  contentType: 'multipart/form-data; boundary=...'
}
```

---

## Expected Debug Output

### Scenario A: Authorization Header NOT Reaching Server
**Client Console**:
```
🔍 Upload request - token exists: true token preview: eyJhbGciOiJIUzI1NiI...
🔍 Building headers for upload: {
  hasAuthInMerged: true,
  authPreview: 'Bearer eyJhbGciOiJIUzI1NiIsInR5...',
  allHeaderKeys: ['Authorization']
}
```

**Server Console**:
```
🔍 Upload request authentication check: {
  path: '/upload',
  url: '/upload',
  hasAuthHeader: false,  <-- PROBLEM: Header not reaching server
  authHeaderPreview: undefined,
  hasSession: false,
  contentType: 'multipart/form-data; boundary=...'
}
```

**Diagnosis**: Headers being stripped somewhere between client and server (CORS, proxy, or browser issue)

### Scenario B: Authorization Header Reaching Server But Invalid
**Client Console**: (Same as Scenario A)

**Server Console**:
```
🔍 Upload request authentication check: {
  path: '/upload',
  url: '/upload',
  hasAuthHeader: true,  <-- Header exists
  authHeaderPreview: 'Bearer eyJhbGciOiJIU...',
  hasSession: false,
  contentType: 'multipart/form-data; boundary=...'
}
Authentication failed: Invalid token  <-- Token validation failing
```

**Diagnosis**: Token exists but validation fails (token expired, wrong secret, or corrupted)

### Scenario C: Header Exists and Token Valid
**Client Console**: (Same as Scenario A)

**Server Console**:
```
🔍 Upload request authentication check: {
  path: '/upload',
  url: '/upload',
  hasAuthHeader: true,
  authHeaderPreview: 'Bearer eyJhbGciOiJIU...',
  hasSession: false,
  contentType: 'multipart/form-data; boundary=...'
}
🔍 Upload request debug: {
  hasFile: true,
  hasUser: true,  <-- Auth succeeded
  userId: 'aRBfhQbiZgoN8KLVXnj7J',
  ...
}
```

**Diagnosis**: Upload should succeed - if it still fails, issue is after auth check

---

## Next Steps Based on Output

### If Header NOT Reaching Server (Scenario A):
1. Check browser Network tab → Headers section for actual request headers sent
2. Try using fetch() directly with explicit headers to isolate issue:
   ```javascript
   const token = localStorage.getItem('auth_token');
   const formData = new FormData();
   formData.append('file', fileInput.files[0]);
   formData.append('name', 'test');

   fetch('http://localhost:5173/api/projects/upload', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${token}`
     },
     body: formData,
     credentials: 'include'
   }).then(r => console.log('Direct fetch result:', r.status));
   ```
3. Check for CORS preflight issues
4. Verify no proxy/middleware stripping headers

### If Header Reaches Server But Token Invalid (Scenario B):
1. Check `tokenStorage.validateToken()` implementation
2. Verify JWT secret matches between token generation and validation
3. Check token expiration time
4. Verify token format (should be valid JWT)

### If Auth Succeeds But Upload Still Fails (Scenario C):
1. Check multer middleware configuration
2. Verify file size limits
3. Check for other middleware interfering after auth
4. Review dataVerificationRouter middleware (runs before projectRouter)

---

## Files Modified

### Client-Side (1 file)
**`client/src/lib/api.ts`**
- Line 290-292: Added token existence check before upload
- Line 123-130: Added header debugging during request building

### Server-Side (1 file)
**`server/routes/auth.ts`**
- Line 356-365: Added authentication debugging for upload requests

---

## Important Notes

1. **Remove Debug Logs After Issue Resolved**: These logs contain sensitive token previews (first 20-30 chars). Remove after debugging.

2. **Token Security**: The logs intentionally show only token previews, not full tokens, but still remove after debugging.

3. **FormData + Authorization Headers**: Some older browsers have issues with custom headers on FormData requests. If this is the issue, we may need to:
   - Use alternative auth method (cookie-based)
   - Send token as FormData field instead of header
   - Use different upload library

4. **Middleware Order**: The upload endpoint has this middleware order:
   ```
   ensureAuthenticated → upload.single('file') → handler
   ```
   If auth passes but upload fails, the issue is in multer or handler.

---

## Status

**Ready for Testing**: User should restart server and test file upload to see debug output.

**Next Action**: Review console output from both client and server to diagnose the issue based on scenarios above.
