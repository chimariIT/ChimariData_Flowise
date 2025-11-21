# Authentication Regression - Focused Action Plan

**Issue**: Login succeeds but `/api/projects` returns 401
**Priority**: P0 - CRITICAL
**Created**: November 7, 2025

---

## What We Know (Evidence-Based)

### ✅ Confirmed Facts

1. **User can log in** - Login endpoint succeeds
2. **Frontend shows logged in** - UI updates correctly
3. **`/api/projects` returns 401** - Multiple occurrences in logs
4. **Error message**: "Authentication required"
5. **File uploads also fail** - Same authentication issue

### ❓ What We Don't Know Yet

1. **Is token stored in localStorage?** - No evidence yet
2. **Is Authorization header sent?** - Not visible in console logs
3. **Does server receive the header?** - Need server logs
4. **Does token validation pass?** - Need validation logs

---

## Immediate Action Plan (Evidence First)

### Phase 1: Add Debug Logging (15 minutes)

**Goal**: Instrument the entire auth pipeline to see where it breaks

#### 1.1 Client-Side: Login Token Storage
**File**: `client/src/lib/api.ts` around line 974

```typescript
// Find the login method and add logging
if (response.token) {
  console.log('🔐 [LOGIN] Token received from server');
  console.log('🔐 [LOGIN] Token length:', response.token.length);
  console.log('🔐 [LOGIN] Token preview:', response.token.substring(0, 30) + '...');

  localStorage.setItem('auth_token', response.token);

  // VERIFY STORAGE IMMEDIATELY
  const verification = localStorage.getItem('auth_token');
  console.log('🔐 [LOGIN] Token stored in localStorage:', !!verification);
  console.log('🔐 [LOGIN] Storage matches:', verification === response.token);

  this.dispatchAuthEvent('auth-token-stored');
  console.log('🔐 [LOGIN] auth-token-stored event dispatched');
}
```

#### 1.2 Client-Side: Request Header Injection
**File**: `client/src/lib/api.ts` around line 125 (in request method)

```typescript
// After building headers, add this:
if (url.includes('/projects') || url.includes('/upload')) {
  const tokenInStorage = localStorage.getItem('auth_token');
  console.log(`🌐 [API] Making request to ${url}`);
  console.log('🌐 [API] Token in localStorage:', !!tokenInStorage);
  if (tokenInStorage) {
    console.log('🌐 [API] Token preview:', tokenInStorage.substring(0, 30) + '...');
  }
  console.log('🌐 [API] Authorization header:', !!mergedHeaders['Authorization']);
  if (mergedHeaders['Authorization']) {
    console.log('🌐 [API] Auth header value:', mergedHeaders['Authorization'].substring(0, 50) + '...');
  }
}
```

#### 1.3 Server-Side: Middleware Entry
**File**: `server/routes/auth.ts` around line 353 (ensureAuthenticated function)

```typescript
export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  console.log('🔒 [AUTH MW] Request:', req.method, req.url);
  console.log('🔒 [AUTH MW] Has session:', !!req.isAuthenticated?.());
  console.log('🔒 [AUTH MW] Authorization header:', req.headers.authorization ? 'YES' : 'NO');

  if (req.headers.authorization) {
    console.log('🔒 [AUTH MW] Header value:', req.headers.authorization.substring(0, 50));
  }

  // ... rest of middleware
}
```

#### 1.4 Server-Side: Token Validation
**File**: `server/token-storage.ts` around line 30 (validateToken function)

```typescript
export function validateToken(token: string): ValidationResult {
  console.log('🔑 [TOKEN] Validating token');
  console.log('🔑 [TOKEN] Token length:', token.length);
  console.log('🔑 [TOKEN] Token preview:', token.substring(0, 30) + '...');
  console.log('🔑 [TOKEN] JWT_SECRET configured:', !!process.env.JWT_SECRET);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    console.log('🔑 [TOKEN] ✅ Valid - User:', decoded.userId);
    // ... return success
  } catch (error: any) {
    console.log('🔑 [TOKEN] ❌ Invalid:', error.message);
    // ... return failure
  }
}
```

### Phase 2: Reproduce & Collect Evidence (10 minutes)

#### Test Procedure:

1. **Clear browser state**:
   ```javascript
   // In browser console (F12)
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

2. **Start development server** (if not running):
   ```bash
   npm run dev
   ```

3. **Open both consoles**:
   - Browser console (F12)
   - Server terminal

4. **Perform login**:
   - Go to http://localhost:5173/auth
   - Enter credentials
   - Click Login

5. **Watch for logs**:
   - Look for 🔐 [LOGIN] messages
   - Verify token storage

6. **Navigate to dashboard**:
   - Should automatically redirect or go to http://localhost:5173/dashboard

7. **Watch for project fetch**:
   - Look for 🌐 [API] messages in browser
   - Look for 🔒 [AUTH MW] messages in server
   - Look for 🔑 [TOKEN] messages in server

8. **Collect evidence**:
   ```bash
   # Take screenshots of:
   # - Browser console
   # - Server console
   # - Network tab (Headers for /api/projects)
   ```

### Phase 3: Analyze Evidence (5 minutes)

**Decision Tree**:

```
Is token stored in localStorage after login?
├─ NO  → Login response handling broken
│       Fix: Check login method, verify response has token
│
└─ YES → Is Authorization header present in request?
    ├─ NO  → Header injection broken
    │       Fix: Check buildAuthHeaders(), verify it's called
    │
    └─ YES → Does server receive the header?
        ├─ NO  → Network proxy issue or CORS
        │       Fix: Check nginx/proxy config, CORS headers
        │
        └─ YES → Does token validation pass?
            ├─ NO  → Token invalid or JWT_SECRET mismatch
            │       Fix: Check JWT_SECRET, verify token format
            │
            └─ YES → req.user not set after validation
                    Fix: Check ensureAuthenticated sets req.user correctly
```

### Phase 4: Apply Targeted Fix (15 minutes)

**Based on evidence, apply ONE of these fixes**:

#### Fix A: Token Not Stored (if Phase 3 shows NO token in localStorage)
```typescript
// client/src/lib/api.ts - Add error handling
try {
  localStorage.setItem('auth_token', response.token);

  // Force verification
  if (!localStorage.getItem('auth_token')) {
    throw new Error('Failed to store token in localStorage');
  }
} catch (error) {
  console.error('❌ Token storage failed:', error);
  alert('Login failed: Could not store authentication token. Please check browser settings.');
  throw error;
}
```

#### Fix B: Header Not Sent (if token stored but header missing)
```typescript
// client/src/lib/api.ts - Ensure headers are applied
const finalHeaders = new Headers();

// Build auth headers first
const authHeaders = this.buildAuthHeaders();
Object.entries(authHeaders).forEach(([key, value]) => {
  finalHeaders.set(key, value);
});

// Then add any custom headers
if (init.headers) {
  const customHeaders = new Headers(init.headers);
  customHeaders.forEach((value, key) => {
    if (key.toLowerCase() !== 'content-type' || !isFormData) {
      finalHeaders.set(key, value);
    }
  });
}

finalInit.headers = finalHeaders;
```

#### Fix C: Server Validation Fails (if token sent but validation fails)
```typescript
// server/token-storage.ts - Add better error handling
export function validateToken(token: string): ValidationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is missing or invalid type' };
  }

  if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET not configured');
    return { valid: false, error: 'Server configuration error' };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;

    if (!decoded.userId || !decoded.email) {
      return { valid: false, error: 'Token missing required fields' };
    }

    return { valid: true, userId: decoded.userId, email: decoded.email };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}
```

#### Fix D: req.user Not Set (if validation passes but req.user is null)
```typescript
// server/routes/auth.ts - Ensure user is attached
export async function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  // ... after token validation passes

  const user = await storage.getUser(validation.userId);

  if (!user) {
    console.error('❌ User not found in database:', validation.userId);
    return res.status(401).json({ error: 'User account not found' });
  }

  // CRITICAL: Set req.user
  req.user = user;

  // Verify it's set
  console.log('✅ req.user set:', !!req.user, user.id);

  next();
}
```

### Phase 5: Test Fix (10 minutes)

1. **Restart server** (if server-side changes):
   ```bash
   # Ctrl+C to stop, then:
   npm run dev
   ```

2. **Clear browser state**:
   ```javascript
   localStorage.clear();
   location.reload();
   ```

3. **Test login → dashboard → projects flow**:
   - Should see debug logs
   - Projects should load
   - No 401 errors

4. **Test file upload**:
   - Upload a file
   - Should succeed

5. **Verify no regressions**:
   - Test OAuth login (if configured)
   - Test other authenticated routes

### Phase 6: Clean Up (5 minutes)

1. **Remove debug logging** or make conditional:
   ```typescript
   const DEBUG_AUTH = process.env.DEBUG_AUTH === 'true';

   if (DEBUG_AUTH) {
     console.log('🔐 [LOGIN] Token stored');
   }
   ```

2. **Document the fix**:
   - Add comment explaining the issue
   - Update this document with findings

3. **Commit changes**:
   ```bash
   git add .
   git commit -m "Fix: Authentication token not propagating to /api/projects

   Root cause: [FILL IN BASED ON EVIDENCE]
   Solution: [FILL IN BASED ON FIX APPLIED]

   - Added token storage verification
   - Fixed [specific issue]
   - Tested: login, projects fetch, file upload"
   ```

---

## Total Time Estimate: 1 hour

- Phase 1: Add logging (15 min)
- Phase 2: Reproduce (10 min)
- Phase 3: Analyze (5 min)
- Phase 4: Fix (15 min)
- Phase 5: Test (10 min)
- Phase 6: Clean up (5 min)

---

## Success Criteria

- [ ] User can log in
- [ ] Token stored in localStorage (verified)
- [ ] `/api/projects` returns 200 with projects
- [ ] Dashboard shows user's projects
- [ ] File upload succeeds
- [ ] No 401 errors in console
- [ ] Debug logs show complete flow

---

## Rollback Plan

If fix breaks something:

```bash
# Revert changes
git reset --hard HEAD~1

# Restart server
npm run dev
```

---

## After Resolution

### Immediate:
- [ ] Remove or conditionally enable debug logging
- [ ] Test with multiple user accounts
- [ ] Verify OAuth login still works

### Short-term:
- [ ] Add E2E test for login → projects flow
- [ ] Add test for token storage verification
- [ ] Add test for Authorization header injection

### Long-term (only if needed):
- [ ] Review security hardening (admin endpoint, email domain)
- [ ] Consider moving to httpOnly cookies
- [ ] Add token refresh indicators in UI

---

**Next Step**: Add debug logging and reproduce the issue to collect evidence.
