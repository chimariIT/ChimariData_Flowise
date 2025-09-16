# Replit OAuth Dynamic Domain Solution

## The Problem
Replit generates dynamic domains like:
- `da05f8e6-364c-47b1-8d45-8b3843286766.picard.prod.repl.run`
- `49ae2ff9-66f5-4a45-ab34-570919c62400.picard.prod.repl.run`
- `6cf2fda5-1367-48d1-9c6d-64e54a09317d.picard.prod.repl.run`

These change every time the app restarts or gets a new instance.

## The Solution

### Option 1: Use Replit's Built-in Domains (Recommended)
Instead of configuring individual domains, use Replit's persistent domain patterns:

**Add these to Google Cloud Console:**

#### Authorized JavaScript Origins:
```
https://chimaridata.com
https://chimaridata.ai
https://chimari-data.net
```

#### Authorized Redirect URIs:
```
https://chimaridata.com/api/auth/google/callback
https://chimaridata.ai/api/auth/google/callback
https://chimari-data.net/api/auth/google/callback
```

### Option 2: Configure for Current Session
For immediate testing, add the current domain:

#### Current Domain (expires when Replit restarts):
- JavaScript Origin: `https://da05f8e6-364c-47b1-8d45-8b3843286766.picard.prod.repl.run`
- Redirect URI: `https://da05f8e6-364c-47b1-8d45-8b3843286766.picard.prod.repl.run/api/auth/google/callback`

### Option 3: Development Workaround
For development, you can also add localhost:
- JavaScript Origin: `http://localhost:5000`
- Redirect URI: `http://localhost:5000/api/auth/google/callback`

## Recommended Workflow
1. Deploy to production domains (chimaridata.com, etc.)
2. Configure OAuth only for production domains
3. Test OAuth on production rather than dynamic Replit domains

This avoids the dynamic domain issue entirely.