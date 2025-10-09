@echo off
echo 📸 ChimariData Screenshot Generation Setup
echo ==========================================

echo.
echo 🔧 Step 1: Starting development server...
start cmd /k "npm run dev"

echo.
echo ⏳ Waiting for server to start (30 seconds)...
timeout /t 30 /nobreak

echo.
echo 📸 Step 2: Generating screenshots...
node scripts\generate-screenshots.js

echo.
echo ✅ Screenshot generation complete!
echo 📁 Check the 'screenshots' folder for results
echo.
pause