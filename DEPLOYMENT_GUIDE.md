# ChimariData.com Deployment Guide

## Pre-Deployment Checklist

Your DataInsight Pro platform is ready for deployment to chimaridata.com. Here's what's configured:

### ✅ Application Ready
- **Frontend**: React SPA with Vite build system
- **Backend**: Express.js API server with AI integrations
- **Database**: PostgreSQL with schema management
- **Build Script**: `npm run build` (creates production bundle)
- **Start Script**: `npm run start` (runs production server)

### ✅ Environment Configuration
Required environment variables for production:
- `GOOGLE_AI_API_KEY` (already configured)
- `DATABASE_URL` (will be provided by Replit Deployments)

## Deployment Steps

### 1. Deploy via Replit
1. Click the **Deploy** button in your Replit project
2. Choose **Autoscale** deployment type for scalability
3. Select **Custom Domain** option
4. Enter domain: `chimaridata.com`

### 2. Domain Configuration (GoDaddy)
Configure these DNS records in your GoDaddy account:

```
Type: A
Name: @
Value: [Replit will provide the IP address]
TTL: 600

Type: CNAME  
Name: www
Value: chimaridata.com
TTL: 600
```

### 3. SSL Certificate
Replit Deployments will automatically provision an SSL certificate for HTTPS.

### 4. Production Environment
- **URL**: https://chimaridata.com
- **Admin Panel**: https://chimaridata.com/settings
- **API Endpoint**: https://chimaridata.com/api

## Post-Deployment Verification

1. **Homepage**: Verify authentication system works
2. **Registration**: Test user signup/login flow  
3. **AI Chat**: Test platform AI service with sample data
4. **Settings**: Verify subscription management and provider switching
5. **Pricing**: Confirm upgrade flow works correctly

## Features Available After Deployment

### For Free Users (Starter Plan)
- 50 AI queries per month using platform Gemini service
- CSV/JSON/Excel file upload
- Basic data visualizations
- Natural language data querying

### For Professional Users  
- 500 AI queries per month
- Custom AI provider support (Anthropic, OpenAI, Gemini)
- Advanced visualizations
- Priority support

## Support & Maintenance

- **Monitoring**: Replit provides automatic health checks
- **Scaling**: Autoscale handles traffic increases
- **Backups**: Database backups managed automatically
- **Updates**: Deploy new versions via git push

Your comprehensive SOP data analytics platform will be live at chimaridata.com once deployed!