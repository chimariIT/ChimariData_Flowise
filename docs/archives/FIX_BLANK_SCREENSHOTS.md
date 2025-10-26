# Fix Applied: Blank Screenshots Issue

## Problem
Screenshots were showing "Cannot GET /page" - blank pages.

## Root Cause
The tests were navigating to **port 3000** (backend API server) instead of **port 5173** (frontend Vite dev server). The React app with all the routes runs on port 5173, not on the Express API server.

## Fix Applied

### 1. **Updated Base URLs** (`tests/utils/production-test-helpers.ts`)

**Before:**
```typescript
baseUrl: process.env.BASE_URL || 'http://localhost:3000'
```

**After:**
```typescript
// Client app runs on port 5173 (Vite dev server)
// API runs on port 3000 (Express server)
baseUrl: process.env.BASE_URL || 'http://localhost:5173',
apiUrl: process.env.API_URL || 'http://localhost:3000',
```

### 2. **Separated Client and API URLs**

- **Client URLs** (port 5173): All page navigation, screenshot capture
- **API URLs** (port 3000): Authentication, registration, backend calls

### 3. **Enhanced Page Load Waiting**

Added better checks to ensure pages are fully rendered before screenshots:
- Wait for network idle (increased to 10s)
- Wait for body element to be visible
- Check for React app mount (`#root`, `#app`, etc.)
- Verify page has content (minimum 100 chars)
- Extra 2-second delay for JS execution

### 4. **Fixed Route Paths**

Updated all test routes to match actual application routes:

**User Journey Routes:**
- ✅ `/` - Landing page (instead of `/dashboard`)
- ✅ `/journeys/{type}/prepare` - Prepare step
- ✅ `/journeys/{type}/data` - Data upload
- ✅ `/journeys/{type}/project-setup` - Project setup
- ✅ `/journeys/{type}/execute` - Execute analysis
- ✅ `/journeys/{type}/pricing` - Pricing
- ✅ `/journeys/{type}/results` - Results

**Admin Routes:**
- ✅ `/admin` - Admin dashboard
- ✅ `/admin/agents` - Agent management
- ✅ `/admin/tools` - Tools management
- ✅ `/admin/billing` - Billing/usage
- ✅ `/pricing` - Pricing page
- ✅ `/settings` - User settings

### 5. **Improved Authentication**

Now stores both token AND user data in localStorage for fast-path auth:

```typescript
await page.addInitScript(({ authToken, userData }) => {
  window.localStorage.setItem('auth_token', authToken);
  if (userData) {
    window.localStorage.setItem('user', JSON.stringify(userData));
  }
}, { authToken: token, userData: user });
```

### 6. **Updated Server Check Scripts**

Both startup scripts now check for BOTH servers:
- ✅ API server (port 3000)
- ✅ Client app (port 5173)

## How to Run Tests Now

1. **Start development servers:**
   ```bash
   npm run dev
   ```
   This starts BOTH:
   - API server on port 3000
   - Client (Vite) on port 5173

2. **Run production tests:**
   ```bash
   npm run test:production
   ```
   Or use the scripts:
   ```bash
   # Windows
   scripts\run-production-journey-tests.bat
   
   # Mac/Linux
   ./scripts/run-production-journey-tests.sh
   ```

## What to Expect

### ✅ Working Screenshots
- Landing page with full content
- Journey wizard pages with forms
- Admin pages with navigation
- All pages fully rendered

### ✅ Console Output
You'll see helpful logs like:
```
✅ App container found: #root
✅ Page has content (2547 chars)
📸 Screenshot: nontech/2024-10-13T15-30-00_step-01-landing-page.png
✅ Navigation successful: http://localhost:5173/
```

### ⚠️ If Pages Still Blank

1. **Check both servers are running:**
   ```bash
   # Terminal 1: Should show both servers
   npm run dev
   # Output should show:
   # - server: Server running on port 3000
   # - client: Local: http://localhost:5173/
   ```

2. **Check browser console in headed mode:**
   ```bash
   npm run test:production-headed
   # Watch for any JS errors
   ```

3. **Verify routes exist:**
   - Open http://localhost:5173/ in your browser
   - Check that pages load manually
   - Verify authentication works

## Technical Details

### Port Configuration

| Service | Port | Purpose | Test Usage |
|---------|------|---------|------------|
| Express API | 3000 | Backend, auth, data | `TEST_CONFIG.apiUrl` |
| Vite Client | 5173 | React app, UI | `TEST_CONFIG.baseUrl` |

### Test Flow

1. **Register user** → API (port 3000)
2. **Get auth token** → API (port 3000)
3. **Inject token** → Browser localStorage
4. **Navigate to page** → Client (port 5173)
5. **Wait for render** → Enhanced checks
6. **Take screenshot** → Full page capture

## Files Modified

1. ✅ `tests/utils/production-test-helpers.ts`
   - Split baseUrl into `baseUrl` (5173) and `apiUrl` (3000)
   - Enhanced page load waiting
   - Improved authentication storage

2. ✅ `tests/production-user-journeys.spec.ts`
   - Updated all route paths
   - Pass user data to auth function
   - Use correct ports

3. ✅ `scripts/run-production-journey-tests.bat`
   - Check both servers
   - Better error messages

4. ✅ `scripts/run-production-journey-tests.sh`
   - Check both servers
   - Better error messages

## Success Indicators

✅ Screenshots show actual page content  
✅ Console logs show "Page has content (XXX chars)"  
✅ Console logs show "App container found: #root"  
✅ No "Cannot GET /page" messages  
✅ Test execution completes successfully  

## Need Help?

If screenshots are still blank:

1. Check `test-results/production-journeys/` for error screenshots
2. Run with headed mode to see what's happening: `npm run test:production-headed`
3. Check console output for specific error messages
4. Verify both servers are running on correct ports

---

**Status:** ✅ FIXED  
**Date:** October 13, 2025  
**Issue:** Blank screenshots showing "Cannot GET /page"  
**Resolution:** Updated to use correct ports (5173 for client, 3000 for API)

