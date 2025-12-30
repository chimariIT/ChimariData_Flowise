# Authentication and Routing Flow Analysis

## Quick Answer: Post-Login Redirection

After a user successfully signs in, they are redirected to **`/`** (the Main Landing Page) by default.

This happens because:
1. User logs in via `/auth` page
2. Server returns JWT token and user data
3. `App.tsx` handleLogin() stores token and checks for intended route
4. No intended route was stored (routes don't pre-store before showing AuthPage)
5. **Default: setLocation('/') redirects user to home**

---

## 1. Authentication Flow

### Login Endpoint (server/routes/auth.ts:88-177)

```
User → POST /api/auth/login
       → Server validates email/password with bcrypt
       → Generates JWT token
       → Returns { success, token, user }
```

Response includes:
- `token`: JWT for API requests
- `user.id`, `user.email`, `user.firstName`, `user.lastName`
- `user.subscriptionTier`

### Client-Side Login (client/src/pages/auth.tsx:37-102)

```typescript
const handleSubmit = async (e) => {
  const result = await apiClient.login({ email, password });
  
  if (result.success) {
    localStorage.setItem('auth_token', result.token);
    onLogin(result);  // Pass to App.tsx
  }
};
```

### App.tsx Handler (client/src/App.tsx:128-148)

```typescript
const handleLogin = (userData: any) => {
  const user = userData.user || userData;
  setUser(user);
  
  if (userData.token) {
    localStorage.setItem('auth_token', userData.token);
  }
  
  // Check for intended route
  const intendedRoute = routeStorage.getAndClearIntendedRoute();
  if (intendedRoute) {
    setLocation(intendedRoute);
  } else {
    setLocation('/');  // ← DEFAULT REDIRECT
  }
  
  userGreetings.storeUserForGoodbye(user);
};
```

---

## 2. Issues with Current Implementation

### Issue: Intended Routes Never Stored

Routes should store intended path before showing AuthPage:

**Current (Wrong)**:
```typescript
<Route path="/dashboard">
  {() => user ? <UserDashboard /> : <AuthPage onLogin={handleLogin} />}
</Route>
```

**Should Be**:
```typescript
<Route path="/dashboard">
  {() => {
    if (user) return <UserDashboard />;
    routeStorage.setIntendedRoute('/dashboard');
    return <AuthPage onLogin={handleLogin} />;
  }}
</Route>
```

**Impact**: User tries to access `/dashboard`, gets redirected to `/`, must manually navigate back.

### Issue: Missing Logout Endpoint

`apiClient.logout()` calls `/api/auth/logout` which doesn't exist.

**Current**: Error is caught silently, logout still works locally.

**Should**: Either add endpoint or remove API call.

---

## 3. Server-Side Authentication

### ensureAuthenticated Middleware (server/routes/auth.ts:353-404)

All protected routes use this middleware:

```typescript
export const ensureAuthenticated = async (req, res, next) => {
  // 1. Check session auth first
  if (req.isAuthenticated?.()) {
    return next();
  }
  
  // 2. Check Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenData = tokenStorage.validateToken(token);
    
    if (tokenData) {
      const user = await storage.getUser(tokenData.userId);
      req.user = user;
      req.userId = user.id;
      return next();
    }
  }
  
  res.status(401).json({ error: "Authentication required" });
};
```

### Protected Routes

All routes use `ensureAuthenticated`:

```typescript
router.get("/", ensureAuthenticated, async (req, res) => {
  // Only authenticated users can list projects
  const projects = await storage.getProjectsByUser(req.userId);
  res.json({ projects });
});
```

### Ownership Verification (server/middleware/ownership.ts)

```typescript
export async function canAccessProject(userId, projectId, isAdmin) {
  const project = await getProject(projectId);
  
  // Admins can access any project
  if (isAdmin) return { allowed: true, project };
  
  // Users can only access their own
  if (project.userId === userId) return { allowed: true, project };
  
  return { allowed: false };
}
```

**Key**: Admins bypass ownership checks.

---

## 4. State Management

### localStorage Keys

```javascript
auth_token       // JWT token
user            // User object (JSON)
intended_route  // Route to redirect after auth
logout_user_name // Name for goodbye toast
```

### App.tsx State

```typescript
const [user, setUser] = useState(null);
const [authLoading, setAuthLoading] = useState(true);
```

On mount, `checkAuthStatus()`:
1. Tries to validate token with server
2. Falls back to localStorage if API fails
3. Sets loading to false

### Token Refresh on 401

If request returns 401:
1. `apiClient` calls `/api/auth/refresh`
2. Server returns new token
3. New token stored in localStorage
4. Original request retried

---

## 5. Protected Routes

### Client-Side (App.tsx)

Conditional rendering:

```typescript
<Route path="/dashboard">
  {() => user ? <Dashboard /> : <AuthPage />}
</Route>
```

**Protected**: /dashboard, /projects, /settings, /admin, /journeys/*, etc.

**Public**: /, /auth, /pricing, /demos

### Main Landing Page (After Login)

**Route**: `/`

Authenticated users see:
- Dashboard button → `/dashboard`
- Choose Journey button → Journey selection
- Sign Out button → Logout

---

## 6. User Dashboard

### Route: /dashboard

```typescript
export default function UserDashboard({ user, onLogout }) {
  const [userProjects] = useQuery({
    queryKey: ['/api/projects', user?.id],
    queryFn: () => apiClient.get('/api/projects')
  });
  
  return (
    <div>
      <h2>Welcome back, {user.firstName}!</h2>
      <Button onClick={() => setLocation('/dashboard')}>Dashboard</Button>
      <ProjectsList projects={userProjects} />
    </div>
  );
}
```

**Features**:
- Welcome message
- User info
- Settings/Admin buttons
- Quick actions (Start Analysis, Browse Templates)
- User's projects list

---

## 7. API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| /api/auth/login | POST | None | Login |
| /api/auth/register | POST | None | Register |
| /api/auth/user | GET | Bearer | Get current user |
| /api/auth/refresh | POST | Bearer | Refresh token |
| /api/auth/logout | POST | ❌ Missing | Logout |
| /api/auth/verify-email | GET | None | Verify email |
| /api/projects | GET | Bearer | List projects |
| /api/projects | POST | Bearer | Create project |
| /api/projects/:id | GET | Bearer | Get project |

---

## Summary

**Post-Login Redirect**: `/` (Main Landing Page)

**Why**: No intended route is stored before authentication.

**To access Dashboard**: Click "Dashboard" button on main page or go to `/dashboard`

**To start new analysis**: Click "Choose Journey" on main page

**To log out**: Click "Sign Out" button (any authenticated page)

---

## Files to Review

- `client/src/App.tsx` - Root routing and auth state
- `client/src/pages/auth.tsx` - Login/register forms
- `client/src/pages/main-landing.tsx` - Home page after login
- `client/src/pages/user-dashboard.tsx` - Dashboard view
- `client/src/lib/api.ts` - API client with auth headers
- `client/src/lib/utils.ts` - routeStorage utilities
- `server/routes/auth.ts` - Auth endpoints
- `server/middleware/ownership.ts` - Access control
- `server/token-storage.ts` - JWT management
