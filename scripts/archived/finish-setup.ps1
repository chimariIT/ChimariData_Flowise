# Complete ChimariData setup after PostgreSQL is ready
Write-Host "🔧 Completing ChimariData setup..." -ForegroundColor Blue

# Set environment variables
$env:DATABASE_URL = "postgresql://postgres:Chimari0320!@localhost:5432/chimaridata_dev"
$env:NODE_ENV = "development"
Write-Host "✅ Environment variables set" -ForegroundColor Green

# Run database migrations
Write-Host "📦 Running database migrations..." -ForegroundColor Blue
npm run db:push
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database schema created successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Migration may have failed - check output above" -ForegroundColor Yellow
}

# Test the application
Write-Host "🧪 Testing application startup..." -ForegroundColor Blue
Write-Host "Starting development server..." -ForegroundColor Yellow
Write-Host "Visit http://localhost:3000 to test authentication" -ForegroundColor Cyan

# Start dev server (this will run indefinitely)
npm run dev

