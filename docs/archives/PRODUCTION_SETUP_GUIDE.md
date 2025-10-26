# 🚀 ChimariData Production Deployment Guide

## Step 1: Database Setup (Choose One)

### Option A: Neon Database (Recommended)
1. Go to https://neon.tech
2. Sign up with GitHub/Google
3. Create new project: "ChimariData"
4. Copy the connection string (looks like: `postgresql://username:password@ep-xxx.us-east-1.neon.tech/neondb`)

### Option B: Supabase Database
1. Go to https://supabase.com
2. Create new project: "ChimariData"
3. Go to Settings → Database
4. Copy PostgreSQL connection string

### Option C: Railway PostgreSQL
1. Go to https://railway.app
2. Create new project
3. Add PostgreSQL service
4. Copy DATABASE_URL from variables

## Step 2: AI Service Setup

### Google AI API Key (Required)
1. Go to https://makersuite.google.com/app/apikey
2. Create new API key
3. Copy the key (starts with `AIza...`)

## Step 3: Cloud Deployment (Choose One)

### Option A: Railway (Recommended for Full-Stack)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway link
railway up
```

### Option B: Vercel (Good for Node.js)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

### Option C: Render (Simple alternative)
1. Go to https://render.com
2. Connect GitHub repo
3. Create Web Service
4. Build Command: `npm run build`
5. Start Command: `npm run start`

## Step 4: Environment Variables

Add these to your deployment platform:

```
DATABASE_URL=your_postgres_connection_string
GOOGLE_AI_API_KEY=your_google_ai_key
SESSION_SECRET=your_secure_random_string_32_chars_min
PORT=3000
NODE_ENV=production
```

Optional (for full features):
```
STRIPE_SECRET_KEY=sk_live_or_test_key
VITE_STRIPE_PUBLIC_KEY=pk_live_or_test_key
SENDGRID_API_KEY=your_sendgrid_key
```

## Step 5: Database Migration

After deployment, run:
```bash
# On Railway
railway run npm run db:push

# On Vercel (via their dashboard or CLI)
vercel env pull .env.local
npm run db:push

# On Render (via their shell)
npm run db:push
```

## Expected Timeline
- Database setup: 5 minutes
- AI API key: 2 minutes
- Platform deployment: 10-15 minutes
- Total: **~20 minutes to production**

## Troubleshooting
- If build times out: Increase build timeout in platform settings
- If database connection fails: Check DATABASE_URL format
- If AI features don't work: Verify GOOGLE_AI_API_KEY is correct