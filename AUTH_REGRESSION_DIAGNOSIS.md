# Authentication Regression Diagnosis

**Issue**: User logs in successfully, frontend shows logged in, but `/api/projects` returns 401 and file uploads fail.

**Date**: November 7, 2025
**Priority**: CRITICAL (Live production issue)

---

## Evidence Collected

### 1. Console Logs Show 401 Errors

**Source**: `console/console-export-2025-11-6_22-22-25.log`

```
[HTTP/1.1 401 Unauthorized 221ms]
[HTTP/1.1 401 Unauthorized 11ms]
http://localhost:5173/api/projects
[HTTP/1.1 401 Unauthorized 16ms]
[HTTP/1.1 401 Unauthorized 11ms]
http://localhost:5173/api/projects
[HTTP/1.1 401 Unauthorized 14ms]
Error fetching projects: Error: Authentication required
Failed to fetch projects, using empty array user-dashboard.tsx:65:17
```

**Key Observation**: Multiple 401 errors on `/api/projects` endpoint

### 2. Code Verification

**Client Side** (`client/src/lib/api.ts:21-24`):
```typescript
private buildAuthHeaders(base: Record<string, string> = {}) {
  const token = localStorage.getItem('auth_token');
  if (token) {
    base['Authorization'] = `Bearer ${token}`;
  }
  return base;
}
```
✅ Token is retrieved from localStorage
✅ Authorization header is built correctly

**Server Side** (`server/routes/project.ts:731`):
```typescript
router.get("/", ensureAuthenticated, async (req, res) => {
  const userId = (req.user as any)?.id;
  if (!userId) {
    return res.status(401).json({ error: "User authentication required" });
  }
  // ...
});
```
✅ Route has `ensureAuthenticated` middleware
✅ Imported from `./auth`

---

## Hypothesis: Token Mismatch or Missing

Based on evidence, the issue is **NOT**:
- ❌ Missing middleware (ensureAuthenticated is applied)
- ❌ Client not sending token (buildAuthHeaders is correct)
- ❌ Wrong endpoint (logs show correct `/api/projects` URL)

The issue **COULD BE**:
1. ✅ **Token not in localStorage** when projects are fetched
2. ✅ **Token invalid or expired** when projects endpoint is called
3. ✅ **Timing issue**: Frontend shows "logged in" before token is actually stored
4. ✅ **ensureAuthenticated middleware failing** to validate token

---

## Diagnostic Steps

### Step 1: Verify Token Storage on Login

**Add Debug Logging**:

**File**: `client/src/lib/api.ts` (login method around line 974)

```typescript
async login(email: string, password: string): Promise<LoginResponse> {
  const response = await this.request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }, { parseJson: true, autoRefresh: false });

  if (response.token) {
    console.log('🔐 Login successful, storing token');
    console.log('  Token preview:', response.token.substring(0, 30) + '...');

    localStorage.setItem('auth_token', response.token);

    // Verify storage immediately
    const storedToken = localStorage.getItem('auth_token');
    console.log('  Token stored:', !!storedToken);
    console.log('  Storage verified:', storedToken === response.token);

    this.dispatchAuthEvent('auth-token-stored');
  } else {
    console.error('❌ Login response missing token:', response);
  }

  return response;
}
```

### Step 2: Verify Token is Sent with /api/projects Request

**Add Debug Logging**:

**File**: `client/src/lib/api.ts` (request method around line 125)

```typescript
// After building auth headers (line 125)
const mergedHeaders = this.buildAuthHeaders(Object.fromEntries(initialHeaders.entries()));

// Add this debug logging
if (url.includes('/projects')) {
  console.log('🔍 Making request to /api/projects');
  console.log('  Token in localStorage:', !!localStorage.getItem('auth_token'));
  console.log('  Token preview:', localStorage.getItem('auth_token')?.substring(0, 30));
  console.log('  Authorization header set:', !!mergedHeaders['Authorization']);
  console.log('  Auth header preview:', mergedHeaders['Authorization']?.substring(0, 40));
}
```

### Step 3: Verify Server Receives Token

**Add Debug Logging**:

**File**: `server/routes/auth.ts` (ensureAuthenticated middleware around line 353)

```typescript
export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  // Add debug logging at the start
  console.log('🔐 ensureAuthenticated middleware called');
  console.log('  URL:', req.url);
  console.log('  Method:', req.method);
  console.log('  Has session:', !!req.isAuthenticated?.());
  console.log('  Has auth header:', !!req.headers.authorization);

  if (req.headers.authorization) {
    console.log('  Auth header preview:', req.headers.authorization.substring(0, 40));
  }

  // Check session-based auth first
  if (req.isAuthenticated && req.isAuthenticated()) {
    console.log('  ✅ Authenticated via session');
    return next();
  }

  // Check JWT Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('  ❌ No Bearer token found');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  console.log('  Extracted token preview:', token.substring(0, 30));

  const validation = tokenStorage.validateToken(token);
  console.log('  Token validation result:', validation);

  if (!validation.valid) {
    console.log('  ❌ Token validation failed:', validation.error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ... rest of middleware
}
```

### Step 4: Check Token Validation

**Add Debug Logging**:

**File**: `server/token-storage.ts` (validateToken method around line 30)

```typescript
export function validateToken(token: string): ValidationResult {
  console.log('🔍 Validating token');
  console.log('  Token preview:', token.substring(0, 30));
  console.log('  JWT_SECRET set:', !!process.env.JWT_SECRET);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    console.log('  ✅ Token signature valid');
    console.log('  User ID:', decoded.userId);
    console.log('  Email:', decoded.email);
    console.log('  Expires:', new Date(decoded.exp! * 1000).toISOString());

    return {
      valid: true,
      userId: decoded.userId,
      email: decoded.email
    };
  } catch (error: any) {
    console.log('  ❌ Token validation error:', error.message);
    return {
      valid: false,
      error: error.message
    };
  }
}
```

---

## Reproduction Steps

### Manual Test

1. **Start Development Server**:
   ```bash
   npm run dev
   ```

2. **Open Browser DevTools** (F12)

3. **Navigate to Login**:
   ```
   http://localhost:5173/auth
   ```

4. **Open Console Tab** and run:
   ```javascript
   // Clear existing auth
   localStorage.clear();
   console.log('LocalStorage cleared');
   ```

5. **Login with Test Account**:
   - Enter email/password
   - Click "Login"

6. **Watch Console for Debug Logs**:
   - Look for "🔐 Login successful, storing token"
   - Verify "Token stored: true"
   - Look for "auth-token-stored" event

7. **Check localStorage**:
   ```javascript
   console.log('Token in storage:', localStorage.getItem('auth_token'));
   ```

8. **Navigate to Dashboard**:
   ```
   http://localhost:5173/dashboard
   ```

9. **Watch Network Tab**:
   - Look for `/api/projects` request
   - Check "Request Headers" for `Authorization: Bearer ...`
   - Check response status (200 vs 401)

10. **Watch Server Console**:
    - Look for ensureAuthenticated debug logs
    - Check if token is received and validated

### cURL Test (Server Running)

```bash
# 1. Login and capture token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  -v

# Copy the token from response

# 2. Test /api/projects with token
curl -X GET http://localhost:5000/api/projects \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -v

# Expected: 200 OK with projects array
# Actual: Check status code and response
```

---

## Expected vs Actual Behavior

### Expected Flow

```
1. User submits login
2. Server validates credentials
3. Server returns JWT token
4. Client stores token in localStorage
5. Client dispatches 'auth-token-stored' event
6. useOptimizedAuth hook detects event
7. Component makes /api/projects request
8. APIClient injects Authorization header
9. Server validates token via ensureAuthenticated
10. Server returns projects
```

### Actual Flow (Hypothesis)

```
1. User submits login ✅
2. Server validates credentials ✅
3. Server returns JWT token ✅
4. Client stores token in localStorage ❓ (needs verification)
5. Client dispatches 'auth-token-stored' event ❓
6. useOptimizedAuth hook detects event ❓
7. Component makes /api/projects request ✅
8. APIClient injects Authorization header ❓ (token might not be in localStorage)
9. Server rejects: 401 Unauthorized ✅
```

**Critical Question**: Is the token actually stored before the projects request is made?

---

## Potential Root Causes

### Root Cause #1: Race Condition

**Scenario**: Dashboard renders and fetches projects before token is stored

**Evidence Needed**:
- Timestamp of login completion
- Timestamp of /api/projects request
- Check if they're < 50ms apart

**Fix**:
- Ensure `useOptimizedAuth` waits for 'auth-token-stored' event
- Add explicit check in `getCurrentUser()` to wait for token

### Root Cause #2: Token Not Stored

**Scenario**: Login succeeds but `localStorage.setItem` fails silently

**Evidence Needed**:
- Check browser localStorage quota
- Check if localStorage.setItem throws errors
- Verify token is in response

**Fix**:
- Add try-catch around localStorage operations
- Add verification after storage

### Root Cause #3: Token Format Mismatch

**Scenario**: Server expects different token format than client sends

**Evidence Needed**:
- Log exact Authorization header value on client
- Log exact Authorization header value received by server
- Compare formats

**Fix**:
- Standardize on "Bearer <token>"
- Verify no extra whitespace or encoding

### Root Cause #4: JWT_SECRET Mismatch

**Scenario**: Token signed with one secret, validated with another

**Evidence Needed**:
- Check JWT_SECRET in .env
- Check if environment variable is loaded
- Verify token signature validation error

**Fix**:
- Ensure JWT_SECRET is consistent
- Restart server after .env changes

### Root Cause #5: Token Expiry

**Scenario**: Token expires immediately or has wrong expiry

**Evidence Needed**:
- Decode token and check `exp` field
- Compare to current timestamp
- Check if expiry is in past

**Fix**:
- Verify server clock is correct
- Check token generation code (should be 24hr expiry)

---

## Quick Diagnosis Commands

### Check if server is running:
```bash
curl http://localhost:5000/api/health
```

### Check JWT_SECRET is set:
```bash
# Windows PowerShell
$env:JWT_SECRET

# Or check server logs on startup
npm run dev:server-only
# Look for "JWT_SECRET" in output
```

### Test authentication endpoint directly:
```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"YOUR_EMAIL\",\"password\":\"YOUR_PASSWORD\"}" \
  | jq

# Should return: { "success": true, "token": "eyJ...", "user": {...} }
```

### Decode JWT token (without validating):
```javascript
// In browser console after login
const token = localStorage.getItem('auth_token');
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log('Token payload:', payload);
console.log('Expires:', new Date(payload.exp * 1000));
console.log('Is expired:', Date.now() > payload.exp * 1000);
```

---

## Next Steps

1. **Add debug logging** to all 4 locations above
2. **Reproduce the issue** with logging enabled
3. **Collect evidence**:
   - Client console logs
   - Server console logs
   - Network tab headers
4. **Identify exact failure point**:
   - Is token stored?
   - Is token sent?
   - Is token received by server?
   - Does token validation succeed?
5. **Apply targeted fix** based on evidence

---

## Resolution Checklist

Once diagnosis is complete:

- [ ] Identified exact failure point
- [ ] Confirmed token storage works
- [ ] Confirmed token transmission works
- [ ] Confirmed server validation works
- [ ] Applied fix
- [ ] Tested full login → projects flow
- [ ] Tested file upload flow
- [ ] Verified no regression on other routes
- [ ] Removed debug logging (or make conditional on DEBUG flag)
- [ ] Updated documentation with findings

---

**Status**: Awaiting evidence collection from reproduction steps
**Owner**: Development team
**Priority**: P0 - Blocks all authenticated features
