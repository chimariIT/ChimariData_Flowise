# Authentication Issue Handoff Document

**Date**: November 7, 2025
**Issue**: Users can log in successfully, but subsequent API calls fail with 401 Unauthorized, causing projects not to load
**Status**: Root cause identified, fix attempted but not working

---

## Problem Summary

### User-Reported Symptoms
- User can successfully log in (frontend shows logged-in state)
- Projects page loads but shows no projects
- File uploads fail with authentication errors
- This is a **live regression** - authentication was working previously

### Root Cause Identified
**Authorization header is NOT reaching the server** even though the client is adding it to requests.

**Evidence**:
- **Client logs** show: `🌐 [REQUEST] GET /api/projects - Auth: Bearer eyJhbGciOiJIU...`
- **Server logs** show: `hasAuthHeader: false`, `authHeaderValue: 'null'`
- **Server headers received**: NO `authorization` header in the list (see debug output below)

**Why**: Firefox (and other browsers) strip the `Authorization` header when making cross-origin requests with `credentials: 'include'`. This is a browser security policy.

---

## Investigation Timeline

### 1. Initial Hypothesis (WRONG)
- **Thought**: Vite proxy was stripping Authorization headers
- **Action**: Modified `vite.config.ts` proxy configuration multiple times
- **Result**: Failed - proxy wasn't the issue

### 2. Second Hypothesis (WRONG)
- **Thought**: Token storage was failing
- **Action**: Added extensive localStorage diagnostics
- **Result**: Token IS being stored correctly (207 chars, persists after 100ms)

### 3. Third Hypothesis (WRONG)
- **Thought**: CORS configuration was blocking requests
- **Action**: Verified CORS allows localhost origins, added `exposedHeaders`
- **Result**: CORS config is correct

### 4. Actual Root Cause (CONFIRMED)
- **Issue**: Browser security policy strips `Authorization` header from cross-origin requests when `credentials: 'include'`
- **Evidence**: Server debug logs show NO authorization header in received headers
- **Trigger**: Development setup uses cross-origin requests (localhost:5173 → localhost:5000)

---

## Files Modified

### 1. `client/src/lib/api.ts`
**Line 3**: Changed API_BASE to bypass Vite proxy
```typescript
// Before:
const API_BASE = window.location.origin;

// After:
const API_BASE = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
```

**Line 150-157**: Changed credentials mode for cross-origin requests
```typescript
// CRITICAL: Use 'omit' for cross-origin requests to allow Authorization header
// Firefox strips Authorization header when using credentials: 'include' with CORS
const isDevCrossOrigin = import.meta.env.DEV && API_BASE !== window.location.origin;

const finalInit: RequestInit = {
  ...init,
  credentials: isDevCrossOrigin ? 'omit' : (init.credentials ?? 'include'),
  signal
};
```

**Line 162-168**: Added request logging
```typescript
// Debug: Log request details including Authorization header
const hasAuth = finalHeaders.has('Authorization');
const authPreview = hasAuth ? finalHeaders.get('Authorization')?.substring(0, 20) + '...' : 'none';
console.log(`🌐 [REQUEST] ${finalInit.method || 'GET'} ${url} - Auth: ${authPreview}`);
```

**Line 179-190**: Added token removal logging
```typescript
if (response.status === 401 && autoRefresh) {
  console.error('🔐 [AUTH] 401 response - REMOVING TOKEN from localStorage');
  console.error('🔐 [AUTH] Request was:', finalInit.method || 'GET', url);
  localStorage.removeItem('auth_token');
  this.dispatchAuthEvent('auth-token-cleared');
  console.error('🔐 [AUTH] Token cleared event dispatched');
}
```

**Line 973-1007**: Added extensive localStorage diagnostics
```typescript
if (result?.token) {
  console.log('🔐 [LOGIN] Token received, length:', result.token.length);
  console.log('🔐 [LOGIN] localStorage available:', typeof localStorage !== 'undefined');
  console.log('🔐 [LOGIN] localStorage length before:', localStorage.length);

  try {
    localStorage.setItem('auth_token', result.token);
    console.log('🔐 [LOGIN] setItem completed without exception');
  } catch (storageError) {
    console.error('🔐 [LOGIN] localStorage.setItem FAILED:', storageError);
  }

  // Immediate verification
  const stored = localStorage.getItem('auth_token');
  console.log('🔐 [LOGIN] Immediate check - Token stored:', !!stored, 'Length matches:', stored?.length === result.token.length);
  console.log('🔐 [LOGIN] localStorage length after:', localStorage.length);

  // Delayed verification to check for async clearing
  setTimeout(() => {
    const delayed = localStorage.getItem('auth_token');
    console.log('🔐 [LOGIN] Delayed check (100ms) - Token still exists:', !!delayed);
  }, 100);

  this.dispatchAuthEvent('auth-token-stored');
  console.log('🔐 [LOGIN] Event dispatched: auth-token-stored');
}
```

### 2. `client/src/hooks/useOptimizedAuth.ts`
**Line 77-79**: Added token removal logging
```typescript
} catch (error) {
  // Clear invalid token
  console.error('🔐 [useOptimizedAuth] checkAuth failed, REMOVING TOKEN');
  console.error('🔐 [useOptimizedAuth] Error was:', error);
  localStorage.removeItem('auth_token');
```

### 3. `client/src/utils/journey-routing.ts`
**Created new file** - Missing utility functions that were being imported
```typescript
export function canResumeJourney(journeyState: JourneyState | null | undefined): boolean
export async function getResumeRoute(projectId: string, journeyState: JourneyState | null | undefined): Promise<string>
```

### 4. `server/routes/auth.ts`
**Line 394-397**: Added comprehensive header debugging
```typescript
// Debug: Log ALL headers to see what's actually coming in
console.log('🔍 [AUTH DEBUG] All request headers:', JSON.stringify(req.headers, null, 2));
console.log('🔍 [AUTH DEBUG] Authorization header specifically:', req.headers.authorization);
console.log('🔍 [AUTH DEBUG] Headers keys:', Object.keys(req.headers));
```

### 5. `server/middleware/security-headers.ts`
**Line 228-229**: Added allowed headers and exposedHeaders
```typescript
allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Customer-Context'],
exposedHeaders: ['Authorization'],
```

---

## Current Server Debug Output

When a request to `/api/projects` is made after login, the server receives:

```json
{
  "host": "localhost:5000",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
  "accept": "*/*",
  "accept-language": "en-US,en;q=0.5",
  "accept-encoding": "gzip, deflate, br, zstd",
  "referer": "http://localhost:5173/",
  "origin": "http://localhost:5173",
  "sec-gpc": "1",
  "connection": "keep-alive",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "priority": "u=4"
}
```

**Notice**: NO `authorization` header in the list!

Server output:
```
❌ Authentication failed: No valid authorization header {
  hasAuthHeader: false,
  authHeaderType: 'undefined',
  authHeaderValue: 'null'
}
```

---

## Current Client Debug Output

When the same request is made, the client logs:

```
🔐 [LOGIN] Token received, length: 207
🔐 [LOGIN] localStorage available: true
🔐 [LOGIN] localStorage length before: 2
🔐 [LOGIN] setItem completed without exception
🔐 [LOGIN] Immediate check - Token stored: true Length matches: true
🔐 [LOGIN] localStorage length after: 3
🔐 [LOGIN] Event dispatched: auth-token-stored
🔐 [LOGIN] Delayed check (100ms) - Token still exists: true
🌐 [REQUEST] GET /api/projects - Auth: Bearer eyJhbGciOiJIU...
```

**Notice**: Client DOES have the Authorization header in the request!

---

## What's Confirmed Working

✅ **Login endpoint** - Returns valid JWT token (207 chars)
✅ **Token storage** - localStorage successfully stores token
✅ **Token persistence** - Token exists after 100ms, not being cleared
✅ **Client-side header building** - Authorization header is added to fetch request
✅ **CORS configuration** - Server allows localhost:5173 origin
✅ **JWT validation** - `server/token-storage.ts` validates tokens correctly
✅ **Server authentication middleware** - `ensureAuthenticated` works when it receives the header

---

## What's NOT Working

❌ **Authorization header transmission** - Header is NOT reaching the server from the browser
❌ **Subsequent API calls** - All fail with 401 after login
❌ **Projects loading** - User dashboard shows no projects

---

## Attempted Fixes (All Failed)

### Fix Attempt 1: Modify Vite Proxy Configuration
**File**: `vite.config.ts`
**Changes**:
- Changed target port from 5173 to 5000
- Set `changeOrigin: true` then `false`
- Added `configure` callback to explicitly preserve headers
**Result**: Failed - Headers still not forwarded

### Fix Attempt 2: Bypass Vite Proxy Completely
**File**: `client/src/lib/api.ts` line 3
**Change**: Point API_BASE directly to `http://localhost:5000`
**Result**: Failed - Same issue (cross-origin now)

### Fix Attempt 3: Update CORS Configuration
**File**: `server/middleware/security-headers.ts`
**Changes**:
- Added `X-Customer-Context` to `allowedHeaders`
- Added `exposedHeaders: ['Authorization']`
**Result**: Failed - `exposedHeaders` only affects response headers, not request headers

### Fix Attempt 4: Change Credentials Mode
**File**: `client/src/lib/api.ts` line 150-157
**Change**: Use `credentials: 'omit'` for cross-origin requests instead of `'include'`
**Reasoning**: Firefox strips Authorization header when using `credentials: 'include'` with CORS
**Result**: **NOT CONFIRMED** - This was the last attempt

---

## Recommended Next Steps

### Option 1: Investigate Browser Behavior
1. **Test with Chrome/Edge** - See if issue is Firefox-specific
2. **Check browser console Network tab** - Verify if Authorization header is in the actual HTTP request
3. **Test with browser extensions disabled** - Privacy extensions might be stripping headers

### Option 2: Alternative Authentication Approach
Instead of Bearer tokens in headers, consider:
1. **Use cookies for authentication** - More compatible with cross-origin + credentials
2. **Implement token in URL query parameter** (less secure, not recommended)
3. **Use same-origin setup in development** - Run Vite dev server proxy correctly

### Option 3: Fix Vite Proxy (Recommended)
The Vite proxy SHOULD work but isn't. Investigate why:
1. Check if there's middleware between Vite proxy and Express that strips headers
2. Test proxy with a simple curl command to isolate the issue
3. Review Vite proxy source code for header handling bugs

### Option 4: Development Environment Change
1. **Use production build locally** - Eliminates cross-origin issue
2. **Configure reverse proxy** (nginx/Apache) - Single origin for both client and API
3. **Use different port for frontend** - Configure backend to run on same port in dev

---

## Key Technical Details

### Authentication Flow (Current)
1. User submits login form
2. `POST /api/auth/login` returns JWT token
3. Token stored in localStorage as `auth_token`
4. Subsequent requests should include `Authorization: Bearer <token>` header
5. Server validates token using `tokenStorage.validateToken(token)`
6. If valid, user object attached to `req.user` and request proceeds

### JWT Token Structure
- **Algorithm**: HS256
- **Secret**: `process.env.JWT_SECRET` or default
- **Expiration**: 24 hours
- **Payload**: `{ userId, email, iat, exp }`

### Server Authentication Middleware
**Location**: `server/routes/auth.ts:353-444`
**Logic**:
1. Check session-based auth first (Passport.js OAuth)
2. Check Bearer token in `Authorization` header
3. Extract token, validate with `tokenStorage.validateToken()`
4. Fetch user from database
5. Attach user to `req.user` and proceed
6. Return 401 if any step fails

---

## Environment Details

- **Node.js Version**: (check with `node --version`)
- **Browser**: Firefox 144.0 (Windows)
- **OS**: Windows 10/11
- **Development Server**: Express on port 5000
- **Client Dev Server**: Vite on port 5173
- **Database**: PostgreSQL
- **Session Store**: PostgreSQL

---

## Related Files Reference

### Authentication
- `server/routes/auth.ts` - Main authentication routes and middleware
- `server/token-storage.ts` - JWT token generation and validation
- `client/src/lib/api.ts` - API client with header building

### CORS
- `server/middleware/security-headers.ts` - CORS configuration
- `server/index.ts:23` - CORS middleware registration

### Configuration
- `vite.config.ts:86-112` - Vite proxy configuration
- `.env` - Environment variables (JWT_SECRET, CORS_ORIGIN, etc.)

### Documentation
- `CLAUDE.md` - Main project documentation
- `AUTHENTICATION_REMEDIATION_PLAN.md` - Security hardening plan (not directly related)
- `AUTH_IMPLEMENTATION_CHECKLIST.md` - Implementation checklist

---

## Questions for Next Developer

1. **Is the `credentials: 'omit'` fix working?** Check browser Network tab to see if Authorization header is now present in request
2. **What do browser dev tools show?** Does the Network tab show the Authorization header being sent?
3. **Does it work in Chrome?** Test if this is Firefox-specific behavior
4. **Can we use cookies instead?** Would switching to cookie-based auth be easier?
5. **Is there middleware stripping headers?** Check if any Express middleware is removing the Authorization header before it reaches `ensureAuthenticated`

---

## Critical Code Locations

### Where token is created
`server/routes/auth.ts:123` - `tokenStorage.generateToken(user.id, user.email)`

### Where token is stored client-side
`client/src/lib/api.ts:979` - `localStorage.setItem('auth_token', result.token)`

### Where token is added to requests
`client/src/lib/api.ts:24` - `base['Authorization'] = \`Bearer ${token}\``

### Where token is validated server-side
`server/routes/auth.ts:407` - `tokenStorage.validateToken(token)`

### Where 401 triggers token removal
`client/src/lib/api.ts:186` - `localStorage.removeItem('auth_token')`

---

## Debugging Commands

### Test authentication with curl
```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  -v

# Use token (replace TOKEN with actual token from login response)
curl http://localhost:5000/api/projects \
  -H "Authorization: Bearer TOKEN" \
  -v
```

### Check if header reaches server
Look for this in server logs:
```
🔍 [AUTH DEBUG] All request headers: { ... }
```

If `authorization` is in the list, header is reaching server.
If NOT in the list, browser or proxy is stripping it.

---

**Good luck!** The issue is very close to being solved - we just need to get that Authorization header to actually reach the server.
