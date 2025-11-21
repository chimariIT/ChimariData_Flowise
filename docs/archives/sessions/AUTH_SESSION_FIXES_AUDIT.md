# Authentication & Session Fixes - Architecture Audit

## ✅ Changes Made (Following Existing Architecture)

### Pattern Used: Inline Token Extraction (matching `billing.ts` pattern)

**Reference Pattern**: `server/routes/billing.ts` uses custom `billingAuth` middleware that extracts user from token inline, not using `ensureAuthenticated`.

### Files Fixed:

#### 1. `server/routes/usage.ts`
**Pattern Applied**: Inline token extraction helper function (similar to `billingAuth` in `billing.ts`)

**Changes**:
- Added `getUserFromRequest()` helper function that:
  - Extracts Bearer token from `Authorization` header
  - Validates token using `tokenStorage.validateToken()`
  - Retrieves user from `storage.getUser()`
  - Returns user or null
- **All routes updated** to use this helper instead of `req.user`:
  - `/current` - GET
  - `/check` - POST  
  - `/track` - POST
  - `/history` - GET
  - `/reset` - POST
  - `/upgrade-recommendations` - GET

**No middleware used** - matches the architecture decision to avoid `ensureAuthenticated`.

---

#### 2. `client/src/hooks/useUsageMonitoring.tsx`
**Pattern Applied**: Use `apiClient` methods which return parsed JSON (not Response objects)

**Changes**:
- Fixed `fetchUsageData()` - removed `.json()` call (apiClient.get returns parsed JSON)
- Fixed `checkCanPerformAction()` - removed `.json()` call  
- Fixed `trackAction()` - removed `.json()` call

---

#### 3. `client/src/hooks/useProjectSession.ts`
**Pattern Applied**: Use `apiClient` for authenticated requests

**Changes**:
- Switched from plain `fetch()` to `apiClient.get()` for session endpoint
- Added import: `import { apiClient } from '@/lib/api';`

---

#### 4. `client/src/pages/user-dashboard.tsx`
**Pattern Applied**: Use `apiClient` for authenticated requests

**Changes**:
- Switched from plain `fetch()` to `apiClient.get()` for `/api/admin/permissions` and `/api/projects`
- Added import: `import { apiClient } from "@/lib/api";`

---

#### 5. `client/src/hooks/useUserRole.tsx`
**Pattern Applied**: Use `apiClient` correctly

**Changes**:
- Removed incorrect `.json()` call on `apiClient.get()` response

---

#### 6. `client/src/lib/api.ts`
**Pattern Applied**: Only add Authorization header when token exists

**Changes**:
- Fixed `apiClient.get()` to only add `Authorization` header if token exists (removed empty string fallback)

---

## 🏗️ Architecture Compliance

### ✅ Follows Existing Patterns:
1. **No `ensureAuthenticated` middleware** - matches user's requirement
2. **Inline token extraction** - matches `billingAuth` pattern in `billing.ts`
3. **Uses `tokenStorage` and `storage`** - matches existing auth infrastructure
4. **Frontend uses `apiClient`** - matches existing frontend patterns
5. **Bearer token in Authorization header** - matches existing auth flow

---

## 🔍 Authentication Flow

```
Frontend (apiClient.get/post)
  ↓ Adds Authorization: Bearer <token>
  ↓
Backend Route Handler
  ↓ Calls getUserFromRequest(req)
  ↓ Extracts token from Authorization header
  ↓ Validates with tokenStorage.validateToken()
  ↓ Gets user from storage.getUser()
  ↓ Returns user or null
  ↓ If user exists, proceed; else 401
```

---

## 📋 Summary

All fixes follow the existing architecture pattern of:
- **Inline authentication** (no middleware)
- **Token extraction from Authorization header**
- **Using existing `tokenStorage` and `storage` services**
- **Frontend using `apiClient` for consistent auth headers**

**No design changes** - only fixed implementation to match existing patterns. ✅

