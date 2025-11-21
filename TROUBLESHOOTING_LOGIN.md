# Troubleshooting "Failed to fetch" Login Error

## ⚠️ IMPORTANT: Port Configuration

- **Frontend (React App)**: `http://localhost:5173` - This is where you access the application
- **Backend (API Server)**: `http://localhost:5000` - This serves API endpoints only (e.g., `/api/auth/login`)

**❌ WRONG**: `http://localhost:5000/admin` → Backend doesn't serve frontend routes
**✅ CORRECT**: `http://localhost:5173/admin` → Frontend serves the admin page

## Common Causes

1. **Accessing wrong port** - Using port 5000 instead of 5173 for frontend routes
2. **Server not running** - The backend server must be running on port 5000
3. **Frontend not running** - The frontend server must be running on port 5173
4. **Account doesn't exist** - The email `admintest@chimaridata.com` may not exist yet

## Step-by-Step Fix

### Step 1: Verify Both Servers are Running

**Check if backend server is running (port 5000):**
```powershell
netstat -ano | findstr :5000
```

**Check if frontend server is running (port 5173):**
```powershell
netstat -ano | findstr :5173
```

**Start both servers:**

**Option A: Start both together (recommended):**
```bash
npm run dev
```
This starts both frontend (5173) and backend (5000) servers.

**Option B: Start separately:**
```bash
# Terminal 1: Backend server
npm run dev:server-only

# Terminal 2: Frontend server  
npm run dev:client
```

**Wait for servers to fully start** - Look for messages like:
```
✅ Server started on port 5000
✅ Frontend server running on http://localhost:5173
```

### Step 2: Create Admin Account First

**Before logging in, create the admin account:**

```bash
npm run create-admin -- --email admintest@chimaridata.com --password YourPassword123 --firstName Admin --lastName Test
```

**Or using PowerShell:**
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/auth/setup-admin" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admintest@chimaridata.com","password":"YourPassword123","firstName":"Admin","lastName":"Test"}'
```

### Step 3: Test Login Endpoint Directly

**Verify login endpoint is accessible:**
```powershell
# Test login endpoint (will fail with wrong credentials, but should reach server)
Invoke-WebRequest -Uri "http://localhost:5000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"test@test.com","password":"test"}'
```

**Expected responses:**
- ✅ Server reachable: You'll get a JSON error about credentials (status 400/401)
- ❌ Server not reachable: "Failed to fetch" or connection error

### Step 4: Check Browser Console

**Open browser DevTools (F12) and check:**
1. **Console tab** - Look for CORS errors or network errors
2. **Network tab** - Check if `/api/auth/login` request shows:
   - Status: `(failed)` or `ERR_CONNECTION_REFUSED` → Server not running
   - Status: `CORS error` → CORS configuration issue
   - Status: `404` → Route not found (server needs restart)

### Step 5: Verify CORS Configuration

**Check `server/middleware/security-headers.ts`** - Make sure CORS allows `localhost:5173`:

```typescript
origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
```

## Quick Test Sequence

1. ✅ **Start both servers:** `npm run dev` (or start separately)
2. ✅ **Wait for startup:** Look for "Server started" messages on both ports
3. ✅ **Access frontend:** Open `http://localhost:5173/admin` (NOT port 5000!)
4. ✅ **Create admin account:** `npm run create-admin -- --email admintest@chimaridata.com --password Test123 --firstName Admin --lastName Test`
5. ✅ **Test login:** Try logging in at `http://localhost:5173/admin` with the credentials you created

## Port Summary

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| **Frontend** | 5173 | `http://localhost:5173` | React app, user interface |
| **Backend API** | 5000 | `http://localhost:5000/api/*` | API endpoints only |
| **Admin Page** | 5173 | `http://localhost:5173/admin` | Frontend route |
| **Admin API** | 5000 | `http://localhost:5000/api/admin/*` | Backend API endpoints |

## If Still Failing

**Check server logs** for errors when you try to login:
- Look for route registration messages
- Check for authentication errors
- Verify database connection

**Common fixes:**
- Restart both frontend and backend servers
- Clear browser cache and localStorage
- Check firewall/antivirus blocking localhost connections

