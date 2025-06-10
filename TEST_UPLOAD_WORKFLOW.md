# File Upload Testing Workflow

## Complete Test Steps

### 1. Start the Application
```bash
npm run dev
```
Verify both Express server (port 5000) and FastAPI backend (port 8000) are running.

### 2. User Registration & Login
1. Navigate to the application
2. Register a new account:
   - Username: `testuser`
   - Password: `testpass123`
3. Login with the credentials

### 3. Test File Upload
1. From the dashboard, click "Upload New Project"
2. Fill in the form:
   - **Project Name**: `Sales Analysis Test`
   - **File**: Select `test_data.csv` (provided in root directory)
   - **Questions** (one per line):
     ```
     What are the top selling products by revenue?
     Which region has the highest sales performance?
     What's the average price per category?
     Which products have the best profit margins?
     ```
3. Click "Upload Project"

### 4. Verify Upload Success
- Should see success message
- Project should appear in dashboard
- Should show 15 records processed
- Data size should show ~0.01 MB

### 5. Test Project Results
1. Click on the uploaded project
2. Verify project details are displayed:
   - Record count: 15
   - Data size: ~0.01 MB
   - Questions: 4 questions loaded
3. Check if "Pay for Analysis" button appears

### 6. Test Analysis Payment Flow
1. Click "Pay for Analysis" button
2. Verify pricing calculation:
   - Base price: $5.00
   - Data complexity: simple/moderate
   - Questions charge: $1.00 (for 4th question)
   - Analysis type options: Standard/Advanced/Custom
3. Select analysis type and proceed to payment

### 7. API Testing (Optional)
Test upload via API directly:

```bash
# Create test file upload
curl -X POST http://localhost:5000/api/projects/upload \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "file=@test_data.csv" \
  -F "name=API Test Project" \
  -F "questions=[\"What is the total revenue?\",\"Which category sells best?\"]"
```

## Expected Behaviors

### Success Indicators
- ✅ File uploads without errors
- ✅ CSV data is parsed correctly
- ✅ Project appears in dashboard
- ✅ Record count matches file rows (15)
- ✅ Schema is generated from headers
- ✅ Sample data is stored for AI analysis
- ✅ Questions are saved properly
- ✅ Payment options appear in project view

### Error Scenarios to Test
1. **Invalid File Type**: Upload .txt file → Should show error
2. **Large File**: Upload >50MB file → Should show size error
3. **Empty File**: Upload empty CSV → Should show data error
4. **No Headers**: Upload CSV without headers → Should show format error
5. **Missing Project Name**: Leave name blank → Should show validation error

## Troubleshooting Common Issues

### Upload Button Not Working
- Check browser console for JavaScript errors
- Verify authentication token is valid
- Check network tab for failed requests

### File Processing Errors
- Ensure CSV has proper headers
- Check file encoding (should be UTF-8)
- Verify file size is under 50MB

### Authentication Issues
- Logout and login again
- Clear browser storage
- Check server logs for session errors

### Server Errors
- Check uploads/ directory exists and is writable
- Verify multer middleware is configured
- Check server logs for detailed error messages

## Test Data Characteristics

The provided `test_data.csv` contains:
- **15 records** of product sales data
- **8 columns**: product_id, product_name, category, price, units_sold, revenue, region, sales_date
- **3 categories**: Electronics, Accessories, Office
- **3 regions**: North America, Europe, Asia
- **File size**: ~1KB (ideal for testing)

## Expected Pricing Calculations

For the test data:
- **Base Price**: $5.00
- **Data Size**: Free (under 1MB)
- **Complexity**: Simple (8 columns, 15 records)
- **Questions**: $1.00 (4 questions, first 3 free)
- **Analysis Type**: 
  - Standard: $6.00 total
  - Advanced: $8.50 total  
  - Custom: $11.00 total

## Database Verification

After upload, verify in storage:
```javascript
// Check project was created
storage.projects.has(projectId)

// Verify project data
const project = storage.projects.get(projectId)
console.log({
  name: project.name,
  recordCount: project.recordCount,
  schema: project.schema,
  questions: project.questions,
  dataSizeMB: project.dataSizeMB
})
```