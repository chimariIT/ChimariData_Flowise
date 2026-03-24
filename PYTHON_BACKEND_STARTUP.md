# Python Backend Startup Guide

**Last Updated**: March 24, 2026
**Status**: ✅ Production Ready

---

## Quick Start

This guide shows you how to start the ChimariData application using the Python FastAPI backend (the primary backend).

---

## Prerequisites

### 1. Database Setup

PostgreSQL must be running and accessible:

```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Create database if needed
psql -U postgres -c "CREATE DATABASE chimaridata_dev;"
```

### 2. Python Installation

```bash
# Check Python version (requires 3.11+)
python --version

# Install virtual environment
python -m venv venv
```

---

## Step 1: Start Python Backend

The Python backend is in a separate repository: `chimaridata-python-backend`

```bash
# Navigate to Python backend
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimaridata-python-backend

# Activate virtual environment
venv\Scripts\activate                    # Windows CMD/PowerShell
source venv/bin/activate                 # Git Bash/Linux

# Install dependencies (first time only)
pip install -r requirements.txt

# Run database migrations (first time only)
alembic upgrade head

# Start the backend
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Expected Output

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [12345] using StatReload
INFO:     Started server process [12346]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Database connected: chimaridata_dev
INFO:     Agent orchestrator initialized
INFO:     Semantic matching service ready
INFO:     WebSocket bridge initialized
```

### Verify Python Backend

Open a new terminal and run:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{
  "status": "healthy",
  "database": {
    "status": "healthy",
    "latency_ms": 15.3
  },
  "services": {
    "orchestrator": "initialized",
    "semantic_matching": "initialized",
    "websocket_bridge": "initialized"
  }
}
```

### Python Backend URLs

| Service | URL |
|---------|-----|
| API | http://localhost:8000/api/v1 |
| Health Check | http://localhost:8000/health |
| Swagger Docs | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| WebSocket | ws://localhost:8000/ws |

---

## Step 2: Start Frontend

The frontend proxies all API and WebSocket requests to the Python backend.

```bash
# Navigate to frontend repository
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2

# Install dependencies (first time only)
npm install

# Start frontend (Python backend mode)
npm run dev:frontend
```

### Expected Output

```
  VITE v7.1.6  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

### Open Application

Navigate to: **http://localhost:5173**

---

## Verification

### 1. Check Browser Console (F12)

```
✅ WebSocket connected to ws://localhost:8000/ws
✅ API base URL: http://localhost:8000
✅ Backend health: healthy
```

### 2. Check Network Tab (F12 → Network)

All `/api/*` requests should show:
- Request URL: `http://localhost:5173/api/*`
- Status: 200 (or appropriate status code)
- The request is proxied to port 8000

### 3. Test User Journey

1. **Sign In**: Create an account or sign in
2. **Create Project**: Click "New Project"
3. **Upload Dataset**: Upload a CSV file
4. **Verify Data**: PII detection should run
5. **Transform Data**: Apply transformations
6. **Execute Analysis**: Run descriptive statistics
7. **View Results**: Check results page

---

## Environment Configuration

### Frontend `.env.development`

```bash
# Backend Selection
VITE_USE_PYTHON_BACKEND=true
PYTHON_BACKEND_URL=http://localhost:8000

# Database (shared)
DATABASE_URL="postgresql://postgres:password@localhost:5432/chimaridata_dev"

# AI Provider
GOOGLE_AI_API_KEY="your_google_ai_api_key"
```

### Python Backend `.env`

Located in `chimaridata-python-backend/.env`:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/chimaridata_dev

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_ALGORITHM=HS256

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIzaSy...

# Stripe (optional for development)
STRIPE_SECRET_KEY=sk_test_...
```

---

## Troubleshooting

### Problem: Python backend won't start

**Symptoms**: `uvicorn` command fails with import errors

**Solution**:
```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall

# Check Python version
python --version  # Should be 3.11+
```

### Problem: "Connection Refused" in browser

**Symptoms**: Browser console shows `ERR_CONNECTION_REFUSED`

**Solution**:
```bash
# Verify Python backend is running
curl http://localhost:8000/health

# If not running, start it:
cd chimaridata-python-backend
venv\Scripts\activate
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Problem: Database connection errors

**Symptoms**: `connection to server at "localhost", port 5432 failed`

**Solution**:
```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT 1;"

# Verify DATABASE_URL in both .env files
```

### Problem: CORS errors

**Symptoms**: Browser console shows CORS policy errors

**Solution**:
```bash
# Check Python backend .env
cat chimaridata-python-backend/.env | grep ALLOWED_ORIGINS

# Should include:
# ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Problem: WebSocket connection fails

**Symptoms**: WebSocket shows "disconnected" status

**Solution**:
```bash
# Check WebSocket endpoint is accessible
# In browser console:
const ws = new WebSocket('ws://localhost:8000/ws/test');
ws.onopen = () => console.log('✅ WebSocket connected');
ws.onerror = (e) => console.error('❌ WebSocket error:', e);
```

### Problem: API calls go to wrong port

**Symptoms**: Network tab shows requests to port 5000 instead of 8000

**Solution**:
```bash
# Check vite.config.ts proxy configuration
# Should show:
# '/api': { target: 'http://localhost:8000' }

# Check environment variable
echo $VITE_USE_PYTHON_BACKEND  # Should be "true"
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vite)                         │
│                    http://localhost:5173                    │
│                                                             │
│  React App → Vite Proxy → /api/* → port 8000               │
│                       └─ /ws/* → port 8000                 │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Python FastAPI Backend                         │
│              http://localhost:8000                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  FastAPI Application                                │   │
│  │  - REST API (/api/v1/*)                            │   │
│  │  - WebSocket (/ws)                                 │   │
│  │  - Middleware (CORS, Auth, Rate Limiting)          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐  │
│  │   Agent    │  │  Semantic  │  │   Transformation    │  │
│  │ Orchestrator│  │  Matching  │  │      Engine        │  │
│  └────────────┘  └────────────┘  └─────────────────────┘  │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐  │
│  │  Analysis  │  │    RAG     │  │   Billing & RBAC    │  │
│  │ Execution  │  │ Evidence   │  │                     │  │
│  └────────────┘  └────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL + pgvector                          │
│              localhost:5432                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Comparison: Python vs Node.js Backend

| Feature | Python Backend (Port 8000) | Node.js Backend (Port 5000) |
|---------|---------------------------|----------------------------|
| **Status** | ✅ Primary (Recommended) | ⚠️ Legacy (Rollback Only) |
| **Framework** | FastAPI | Express.js |
| **ORM** | SQLAlchemy (async) | Drizzle |
| **Agents** | LangGraph | EventEmitter |
| **Analysis** | Native Python | subprocess → Python |
| **WebSocket** | FastAPI WebSocket | ws library |
| **Docs** | Swagger UI (/docs) | None |
| **Type Safety** | Pydantic (runtime) | TypeScript (compile-time) |

---

## Switching Back to Node.js Backend

If you need to revert to the Node.js backend:

```bash
# Terminal 1: Start Node.js backend
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2
npm run dev:server-only

# Terminal 2: Update environment and start frontend
# Edit .env.development: VITE_USE_PYTHON_BACKEND=false
npm run dev:frontend
```

Or use the legacy command:

```bash
npm run dev  # Starts both Node.js backend and frontend
```

---

## Next Steps

1. **Explore API Docs**: http://localhost:8000/docs
2. **Read Architecture**: See `docs/ARCHITECTURE.md`
3. **Review Migration Progress**: See `MIGRATION_PROGRESS.md`
4. **Check Admin Features**: Navigate to http://localhost:5173/admin

---

**Status**: ✅ Python backend is production ready
**Last Updated**: March 24, 2026
