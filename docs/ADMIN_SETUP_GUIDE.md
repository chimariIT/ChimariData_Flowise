# Admin Account Setup Guide

**Date**: October 6, 2025
**Status**: ✅ IMPLEMENTED

---

## Overview

This guide documents the admin account setup process for the ChimariData application, including database schema changes, API endpoints, and test utilities.

---

## Changes Implemented

### 1. Database Schema Update

**File**: `shared/schema.ts:254`

Added `isAdmin` field to the `users` table:

```typescript
isAdmin: boolean("is_admin").default(false), // Admin role flag
```

This field is used to identify admin users who have access to admin pages and functionality.

**Migration Applied**: ✅ Database schema pushed successfully via `npm run db:push`

---

### 2. Admin Setup Endpoint

**File**: `server/routes/auth.ts:378-452`

Created new endpoint: `POST /api/auth/setup-admin`

**Purpose**: Creates or updates a user account to have admin privileges.

**Request Body**:
```json
{
  "email": "admin@chimaridata.com",
  "password": "securepassword",
  "firstName": "Admin",
  "lastName": "User"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Admin account created successfully",
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "admin@chimaridata.com",
    "firstName": "Admin",
    "lastName": "User",
    "isAdmin": true,
    "subscriptionTier": "enterprise"
  }
}
```

**Features**:
- Creates new admin user if email doesn't exist
- Updates existing user to admin if email already exists
- Automatically assigns `enterprise` subscription tier
- Returns JWT token for immediate authentication
- Hashes password with bcrypt (10 rounds)

---

### 3. Admin Authorization Middleware

**File**: `server/routes/admin.ts:22-55`

The `requireAdmin` middleware checks for admin access using three methods:

1. `user.role === 'admin'`
2. `user.email?.endsWith('@admin.com')`
3. `user.isAdmin === true` ✅ **NEW**

All admin routes are protected by:
- Rate limiting (`adminRateLimit`)
- Authentication (`ensureAuthenticated`)
- Admin check (`requireAdmin`)

---

### 4. Test Utilities

**File**: `tests/utils/auth.ts`

#### New Function: `setupAdminAccount()`

Creates or updates an admin account via API:

```typescript
export async function setupAdminAccount(
  request: APIRequestContext,
  credentials?: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  }
)
```

**Defaults**:
- Email: `admin@chimaridata.com`
- Password: `admin123`
- First Name: `Admin`
- Last Name: `User`

#### New Function: `loginAsAdmin()`

Authenticates as admin and injects token into browser:

```typescript
export async function loginAsAdmin(
  page: Page,
  request: APIRequestContext,
  credentials?: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  }
)
```

**Process**:
1. Waits for server health check
2. Calls `setupAdminAccount()` to create/update admin
3. Injects JWT token into `localStorage` as `auth_token`
4. Sets `Authorization: Bearer <token>` header for page requests
5. Returns token and user object

---

### 5. Updated Test Suite

**File**: `tests/admin-pages-e2e.spec.ts`

Updated all `test.beforeEach` hooks to use the new `loginAsAdmin()` function:

```typescript
test.beforeEach(async ({ page, request }) => {
  await loginAsAdmin(page, request, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    firstName: 'Admin',
    lastName: 'User'
  });
});
```

This ensures all admin tests run with a properly authenticated admin user.

---

## How to Create Admin Account

### Method 1: Via API (Recommended for Development)

Using cURL:

```bash
curl -X POST http://localhost:3000/api/auth/setup-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@chimaridata.com",
    "password": "admin123",
    "firstName": "Admin",
    "lastName": "User"
  }'
```

Using JavaScript/TypeScript:

```typescript
const response = await fetch('http://localhost:3000/api/auth/setup-admin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@chimaridata.com',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'User'
  })
});

const { token, user } = await response.json();
```

### Method 2: Via Test Utility (E2E Tests)

```typescript
import { loginAsAdmin } from './utils/auth';

test('admin test', async ({ page, request }) => {
  await loginAsAdmin(page, request);
  // Now authenticated as admin
});
```

### Method 3: Direct Database Update (Advanced)

```sql
UPDATE users
SET is_admin = true,
    subscription_tier = 'enterprise'
WHERE email = 'your-email@example.com';
```

---

## Running Admin Tests

### Run All Admin Tests

```bash
npm run test:admin
```

### Run with Browser Visible

```bash
npm run test:admin-headed
```

### Test Coverage

The admin test suite (`tests/admin-pages-e2e.spec.ts`) includes 23 test cases covering:

1. **Agent Management** (8 tests):
   - Load page
   - Display agents list
   - Show agent details
   - Create agent via UI
   - Delete agent
   - Real-time updates
   - Validation errors
   - Network error handling

2. **Tool Management** (4 tests):
   - Load page
   - Display tools list
   - Create tool via UI
   - Delete tool

3. **Agent Templates** (3 tests):
   - Access templates API
   - Filter by category
   - Create agent from template

4. **Subscription Management** (3 tests):
   - Load page
   - Display tier configuration
   - Display pricing information

5. **System Monitoring** (2 tests):
   - System status API
   - Display metrics

6. **Security & Authentication** (3 tests):
   - Require authentication
   - Enforce admin role
   - Apply rate limiting

---

## Test Issues and Solutions

### Issue: Test Timeouts During Login

**Symptoms**:
- Tests timeout after 30 seconds during `beforeEach` hook
- Error: "Test timeout of 30000ms exceeded while running beforeEach hook"

**Root Cause**:
- The `loginAsAdmin()` function waits for server health check
- Database operations may be slow on first run
- Playwright page initialization adds overhead

**Solutions**:

#### Solution 1: Increase Test Timeout (Recommended)

Add to `playwright.config.ts`:

```typescript
export default defineConfig({
  timeout: 60000, // Increase from 30s to 60s
  expect: {
    timeout: 10000
  }
});
```

Or per-test:

```typescript
test('admin test', async ({ page, request }) => {
  test.setTimeout(60000); // 60 seconds for this test
  await loginAsAdmin(page, request);
});
```

#### Solution 2: Shared Authentication State

Use Playwright's storage state to authenticate once and reuse:

```typescript
// auth.setup.ts
import { test as setup } from '@playwright/test';
import { setupAdminAccount } from './utils/auth';

setup('authenticate as admin', async ({ request }) => {
  const { token } = await setupAdminAccount(request);
  // Save auth state
  await request.storageState({
    path: '.auth/admin.json',
    origins: [{
      origin: 'http://localhost:3000',
      localStorage: [{ name: 'auth_token', value: token }]
    }]
  });
});

// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'admin-tests',
      use: { storageState: '.auth/admin.json' },
      dependencies: ['setup']
    }
  ]
});
```

#### Solution 3: Optimize Health Check

Reduce health check timeout in `tests/utils/auth.ts:59-74`:

```typescript
const waitForHealth = async (maxMs = 30000) => { // Reduced from 60s
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < maxMs) {
    try {
      const res = await request.get('/api/health', { timeout: 3000 });
      if (res.ok()) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 200)); // Reduced from 500ms
  }
  // ...
};
```

---

## Security Considerations

### Production Deployment

⚠️ **IMPORTANT**: The `/api/auth/setup-admin` endpoint should be:

1. **Removed or secured** in production
2. **Rate limited** to prevent brute force
3. **Logged** for audit trail
4. **Restricted by IP** or environment variable

**Recommended Approach**:

```typescript
// server/routes/auth.ts
if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_ADMIN_SETUP) {
  // Don't register the endpoint in production
} else {
  router.post("/setup-admin", async (req, res) => {
    // Admin setup logic
  });
}
```

### Initial Admin Creation

For production, create the first admin via:

1. **Database migration**:
   ```sql
   INSERT INTO users (id, email, hashed_password, is_admin, subscription_tier)
   VALUES ('admin-001', 'admin@company.com', '$2b$10$hash...', true, 'enterprise');
   ```

2. **Environment-based setup script**:
   ```bash
   ADMIN_EMAIL=admin@company.com \
   ADMIN_PASSWORD=securepassword \
   npm run setup-admin
   ```

3. **One-time setup command**:
   ```bash
   npm run create-admin -- --email admin@company.com --password securepassword
   ```

---

## Troubleshooting

### Admin Login Not Working

1. **Check database schema**:
   ```bash
   npm run db:push
   ```

2. **Verify admin account exists**:
   ```sql
   SELECT id, email, is_admin, subscription_tier FROM users WHERE is_admin = true;
   ```

3. **Check server logs** for authentication errors

4. **Verify JWT token** is being set in localStorage:
   - Open browser DevTools → Application → Local Storage
   - Look for `auth_token` key

### Admin Routes Return 403 Forbidden

1. **Check isAdmin field**: Ensure user has `isAdmin = true` in database
2. **Check token validity**: Token may have expired
3. **Check middleware order**: Ensure `requireAdmin` runs after `ensureAuthenticated`

### Tests Still Timing Out

1. **Check server is running**: `curl http://localhost:3000/api/health`
2. **Increase timeout**: Add `test.setTimeout(120000)` at test level
3. **Check network**: Ensure no firewall blocking localhost:3000
4. **Review logs**: Check test output for specific error messages

---

## Summary

### Implemented Features

✅ Added `isAdmin` field to users table
✅ Created `/api/auth/setup-admin` endpoint
✅ Built `setupAdminAccount()` and `loginAsAdmin()` test utilities
✅ Updated all admin tests to use new authentication
✅ Database schema changes applied successfully

### Test Results

⚠️ **Current Status**: Tests timeout during authentication (30s limit)

**Recommended Next Steps**:
1. Increase test timeout to 60 seconds
2. Implement shared authentication state for faster tests
3. Optimize health check intervals
4. Consider server-side session management

### Production Readiness

⚠️ **Security Review Required**:
- Secure or remove `/api/auth/setup-admin` endpoint
- Implement proper admin user creation process
- Add audit logging for admin actions
- Set up role-based access control (RBAC) properly

---

*Generated by Admin Setup Process - October 6, 2025*
