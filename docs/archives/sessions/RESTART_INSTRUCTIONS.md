# Restart Server Instructions

## Quick Fix for Port 5000 Error

**Ignore the port error for now** - just close any terminal windows running `npm run dev` and restart.

### Simple Steps:

1. **Close all terminal windows** that might have the server running
2. **In a fresh terminal, run:**
   ```bash
   npm run dev
   ```

If it still says port 5000 is in use, try these PowerShell commands **one at a time**:

### Option 1: Kill Node.js processes only
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Option 2: Check what's on port 5000
```powershell
netstat -ano | findstr :5000
```
(Note the PID number, then kill it with `Stop-Process -Id <PID> -Force`)

### Option 3: Just use a different port
**In `.env` file, add:**
```
PORT=5001
```

Then restart:
```bash
npm run dev
```

---

## All Code Fixes Are Already Applied ✅

The fixes for:
- ✅ Dataset preview loading
- ✅ Schema analysis
- ✅ Data quality endpoint
- ✅ Agent checkpoints

**...are already in the code.** Just restart the server to see them work.

---

## After Restart

1. Hard refresh browser: `Ctrl + Shift + R`
2. Navigate to your project
3. Go to Data Verification step
4. Check Preview tab - should show your data now!
