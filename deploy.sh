#!/bin/bash

# ChimariData Platform Deployment Script
echo "🚀 Starting ChimariData Platform Deployment"

# Check if required files exist
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the application
echo "🔨 Building application..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist directory not created"
    exit 1
fi

echo "✅ Build completed successfully"

# Check environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  WARNING: DATABASE_URL not set"
fi

if [ -z "$GOOGLE_AI_API_KEY" ]; then
    echo "⚠️  WARNING: GOOGLE_AI_API_KEY not set"
fi

# Start the application
echo "🌟 Starting ChimariData Platform..."
npm run start