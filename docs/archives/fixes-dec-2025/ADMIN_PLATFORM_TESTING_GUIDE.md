# Admin Platform Features - Manual Testing Guide

## Prerequisites

### Step 0: Create Admin Account ✅

**Before testing, you need to create an admin account:**

**Option 1: Using npm script (Recommended)**
```bash
# IMPORTANT: Make sure server is running first!
npm run dev:server-only

# In another terminal, create admin account (all arguments required)
npm run create-admin -- --email admin@chimaridata.com --password Admin123 --firstName Admin --lastName User
```

**Note**: If you get "Cannot POST /api/auth/setup-admin", the server needs to be restarted to pick up the new route.

**Option 2: Using cURL (PowerShell)**
```powershell
# Note: Use port 5000, not 3000!
Invoke-WebRequest -Uri "http://localhost:5000/api/auth/setup-admin" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admin@chimaridata.com","password":"admin123","firstName":"Admin","lastName":"User"}'
```

**Option 2b: Using cURL (Git Bash / WSL)**
```bash
curl -X POST http://localhost:5000/api/auth/setup-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@chimaridata.com",
    "password": "admin123",
    "firstName": "Admin",
    "lastName": "User"
  }'
```

**Option 3: Using the Admin UI (if you already have an admin account)**
- Login as existing admin
- Go to Admin Dashboard → Select Customer → Create New Customer tab
- Fill in form and check "Create as Admin User"

**Expected Result:**
- Admin account created/updated successfully
- Returns JWT token (save for API testing if needed)
- User has `isAdmin: true` and `subscriptionTier: 'enterprise'`

---

### Step 1: Start Servers

Ensure both servers are running:
```bash
npm run dev
```
- Frontend: http://localhost:5173
- Backend: http://localhost:5000

## Test Cases and Screenshots to Capture

### 1. Login as Admin ✅

**Test Steps:**
1. Navigate to Admin Dashboard: http://localhost:5173/admin
2. You'll see the login page (since you're not authenticated)
3. Enter admin credentials (email and password)
4. Click "Sign In"

**Expected Result:**
- Login successful
- Redirected to admin dashboard
- Admin navigation visible

**Screenshot:** `01-admin-login-page.png`
- Capture the login page
- Capture successful login and redirect

### 2. Test Customer List Endpoint ✅

**Test Steps:**
1. After logging in as admin, you should see the admin dashboard
2. Look for "Consultant Mode" or "Select Customer" button (usually in header or quick actions)
3. Click on "Consultant Mode" or "Select Customer" button
4. Observe the customer selection modal opens
5. Open browser DevTools (F12) → Network tab
6. Observe the network request to `/api/admin/customers`

**Expected Result:**
- Customer selection modal appears
- API returns `{ success: true, customers: [...] }`
- Customer list shows real users from database (not mock data)
- Only non-admin users are shown

**Screenshots:**
- `02-admin-dashboard.png` - Admin dashboard after login
- `03-consultant-mode-button.png` - Consultant mode button/link
- `04-customer-selection-modal.png` - Customer selection modal with real data
- `05-customer-list-api-response.png` - Network tab showing API response

### 3. Test Customer Creation with Domain Validation ✅

**Test Steps:**
1. In the customer selection modal, click "Create New Customer" tab
2. Fill in the form:
   - First Name: "Test"
   - Last Name: "User"
   - Email: Try `test@chimaridata.com` first
   - Password: Enter a password
   - Company: Optional
3. **Observe domain validation** - Should show green checkmark for @chimaridata.com
4. Try `test@example.com` - Should show warning about non-chimaridata domain
5. Check "Create as Admin User" checkbox (optional)
6. Click "Create Customer"

**Expected Result:**
- Domain validation shows green checkmark for @chimaridata.com domains
- Warning shown for non-chimaridata domains
- User created successfully
- New user appears in customer list

**Screenshots:**
- `06-create-customer-form.png` - Customer creation form
- `07-domain-validation-chimaridata.png` - Domain validation success (@chimaridata.com)
- `08-domain-validation-warning.png` - Domain validation warning (non-chimaridata domain)
- `09-admin-checkbox.png` - Admin user creation checkbox
- `10-user-created-success.png` - Success message after user creation

### 4. Test Consultant Mode Project Creation ✅

**Test Steps:**
1. After creating/selecting a customer, verify consultant mode is active
2. Look for indicator showing you're acting as the customer
3. Upload a file or create a project
4. Check the Network tab → verify project creation request
5. Verify project has customer's userId (not admin's)

**Expected Result:**
- Consultant mode indicator visible
- Project created with customer's userId
- Project metadata includes `createdByAdminId`
- Audit log entry created

**Screenshots:**
- `11-consultant-mode-active.png` - Consultant mode indicator
- `12-project-created-as-customer.png` - Project creation confirmation
- `13-project-userid-verification.png` - API response showing correct userId

### 5. Test Admin Navigation for New Admin User ✅

**Test Steps:**
1. Create a new user with "Create as Admin User" checked
2. Logout from admin account
3. Login as the newly created admin user
4. Verify admin navigation appears
5. Verify access to `/admin` routes

**Expected Result:**
- Admin user can login successfully
- Admin navigation visible (not regular user navigation)
- Can access admin dashboard

**Screenshots:**
- `14-admin-user-login.png` - Login as new admin user
- `15-admin-navigation-visible.png` - Admin navigation for new admin user
- `16-admin-dashboard-access.png` - Admin dashboard accessible

### 6. Test Admin Project Management Endpoints ✅

#### 6a. List All Projects
**Test Steps:**
1. As admin, use browser DevTools to call: `GET http://localhost:5000/api/admin/projects`
2. Or navigate to `/admin/projects` if UI exists

**Expected Result:**
- Returns list of all projects with pagination
- Supports filters: `?userId=...&status=...&journeyType=...`

**Screenshot:** `17-admin-projects-list.png`

#### 6b. Get Specific Project
**Test Steps:**
1. Call: `GET http://localhost:5000/api/admin/projects/:projectId`
2. Verify project details are returned

**Screenshot:** `18-project-details.png`

#### 6c. Update Project
**Test Steps:**
1. Call: `PUT http://localhost:5000/api/admin/projects/:projectId`
2. Body: `{ "name": "Updated Name", "description": "Updated desc" }`
3. Verify project is updated
4. Check audit log entry

**Screenshot:** `19-project-updated.png`

#### 6d. Archive Project
**Test Steps:**
1. Call: `POST http://localhost:5000/api/admin/projects/:projectId/archive`
2. Body: `{ "reason": "Testing archive functionality" }`
3. Verify project metadata has `archivedAt` timestamp

**Screenshot:** `20-project-archived.png`

#### 6e. List Stuck Projects
**Test Steps:**
1. Call: `GET http://localhost:5000/api/admin/projects/stuck`
2. Verify it returns projects with error status >24 hours old

**Screenshot:** `21-stuck-projects.png`

#### 6f. Retry Project
**Test Steps:**
1. Select a stuck/failed project
2. Call: `POST http://localhost:5000/api/admin/projects/:projectId/retry`
3. Verify project status resets to 'ready'

**Screenshot:** `22-project-retried.png`

### 7. Verify Audit Logging ✅

**Test Steps:**
1. Perform any admin action (create/update/delete project or user)
2. Query database:
   ```sql
   SELECT * FROM admin_project_actions 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```
3. Or check via API if endpoint exists

**Expected Result:**
- Audit log entries exist for all admin actions
- Entries include: adminId, projectId, userId, action, changes, IP, userAgent

**Screenshot:** `23-audit-log-entries.png`

## API Testing Script

You can also test endpoints using curl or Postman:

```bash
# Set your auth token (get from login response or setup-admin endpoint)
TOKEN="your-auth-token-here"

# Create user (as admin)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@chimaridata.com",
    "firstName": "New",
    "lastName": "User",
    "password": "password123",
    "isAdmin": false
  }' \
  http://localhost:5000/api/admin/users

# Get customers
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/customers

# List projects
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/projects

# Get specific project
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/projects/PROJECT_ID

# Update project
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}' \
  http://localhost:5000/api/admin/projects/PROJECT_ID

# Archive project
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Test archive"}' \
  http://localhost:5000/api/admin/projects/PROJECT_ID/archive

# List stuck projects
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/projects/stuck

# Retry project
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/admin/projects/PROJECT_ID/retry
```

**Note**: For PowerShell, use `Invoke-WebRequest` instead of `curl`:
```powershell
$TOKEN = "your-auth-token-here"
$headers = @{ "Authorization" = "Bearer $TOKEN"; "Content-Type" = "application/json" }

# Get customers
Invoke-WebRequest -Uri "http://localhost:5000/api/admin/customers" -Headers $headers
```

## Screenshot Checklist

- [ ] Admin login page
- [ ] Admin dashboard after login
- [ ] Consultant mode button/link
- [ ] Customer selection modal
- [ ] Customer list API response (Network tab)
- [ ] Create customer form
- [ ] Domain validation success (@chimaridata.com)
- [ ] Domain validation warning (non-chimaridata domain)
- [ ] Admin user creation checkbox
- [ ] User created success message
- [ ] Consultant mode active indicator
- [ ] Project created with customer userId
- [ ] Admin navigation for new admin user
- [ ] Admin projects list endpoint response
- [ ] Project details endpoint response
- [ ] Project updated confirmation
- [ ] Project archived confirmation
- [ ] Stuck projects list
- [ ] Project retry confirmation
- [ ] Audit log entries in database

## Verification Points

1. **Security**: Projects created in consultant mode use customer's userId ✅
2. **Data Integrity**: Customer list shows real users, not mock data ✅
3. **Functionality**: All admin endpoints work correctly ✅
4. **Audit Trail**: Admin actions are logged in database ✅
5. **Domain Validation**: Email domain validation works for chimaridata domains ✅
6. **Admin User Creation**: Admins can create users with admin privileges ✅
7. **Navigation**: Admin users see admin navigation, regular users see regular navigation ✅


**Test Steps:**
1. Navigate to Admin Dashboard
2. Click "Select Customer" or "Consultant Mode"
3. Select a customer from the list
4. Verify customer info appears in header/UI
5. Upload a file or create a project
6. Check the project's `userId` in database or API response

**Expected Result:**
- Project is created with customer's userId (not admin's userId)
- Project metadata includes `createdByAdminId`
- Audit log entry is created

**Screenshots:**
- `02-consultant-mode-selected.png` - Customer selection modal
- `03-project-created-as-customer.png` - Project creation confirmation
- `04-project-userid-verification.png` - API response showing correct userId

### 3. Test Admin Project Management Endpoints ✅

#### 3a. List All Projects
**Test Steps:**
1. Navigate to Admin Dashboard
2. Use browser DevTools to call: `GET http://localhost:5000/api/admin/projects`
3. Or navigate to `/admin/projects` if UI exists

**Expected Result:**
- Returns list of all projects with pagination
- Supports filters: `?userId=...&status=...&journeyType=...`

**Screenshot:** `05-admin-projects-list.png`

#### 3b. Get Specific Project
**Test Steps:**
1. Call: `GET http://localhost:5000/api/admin/projects/:projectId`
2. Verify project details are returned

**Screenshot:** `06-project-details.png`

#### 3c. Update Project
**Test Steps:**
1. Call: `PUT http://localhost:5000/api/admin/projects/:projectId`
2. Body: `{ "name": "Updated Name", "description": "Updated desc" }`
3. Verify project is updated
4. Check audit log entry

**Screenshot:** `07-project-updated.png`

#### 3d. Archive Project
**Test Steps:**
1. Call: `POST http://localhost:5000/api/admin/projects/:projectId/archive`
2. Body: `{ "reason": "Testing archive functionality" }`
3. Verify project metadata has `archivedAt` timestamp

**Screenshot:** `08-project-archived.png`

#### 3e. List Stuck Projects
**Test Steps:**
1. Call: `GET http://localhost:5000/api/admin/projects/stuck`
2. Verify it returns projects with error status >24 hours old

**Screenshot:** `09-stuck-projects.png`

#### 3f. Retry Project
**Test Steps:**
1. Select a stuck/failed project
2. Call: `POST http://localhost:5000/api/admin/projects/:projectId/retry`
3. Verify project status resets to 'ready'

**Screenshot:** `10-project-retried.png`

### 4. Verify Audit Logging ✅

**Test Steps:**
1. Perform any admin action (create/update/delete project)
2. Query database:
   ```sql
   SELECT * FROM admin_project_actions 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```
3. Or check via API if endpoint exists

**Expected Result:**
- Audit log entries exist for all admin actions
- Entries include: adminId, projectId, userId, action, changes, IP, userAgent

**Screenshot:** `11-audit-log-entries.png`

## API Testing Script

You can also test endpoints using curl or Postman:

```bash
# Set your auth token
TOKEN="your-auth-token-here"

# Get customers
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/customers

# List projects
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/projects

# Get specific project
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/projects/PROJECT_ID

# Update project
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Name"}' \
  http://localhost:5000/api/admin/projects/PROJECT_ID

# Archive project
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Test archive"}' \
  http://localhost:5000/api/admin/projects/PROJECT_ID/archive

# List stuck projects
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/projects/stuck

# Retry project
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/admin/projects/PROJECT_ID/retry
```

## Screenshot Checklist

- [ ] Customer list API response (Network tab)
- [ ] Customer selection modal with real data
- [ ] Consultant mode active indicator
- [ ] Project created with customer userId
- [ ] Admin projects list endpoint response
- [ ] Project details endpoint response
- [ ] Project updated confirmation
- [ ] Project archived confirmation
- [ ] Stuck projects list
- [ ] Project retry confirmation
- [ ] Audit log entries in database

## Verification Points

1. **Security**: Projects created in consultant mode use customer's userId ✅
2. **Data Integrity**: Customer list shows real users, not mock data ✅
3. **Functionality**: All admin endpoints work correctly ✅
4. **Audit Trail**: Admin actions are logged in database ✅

