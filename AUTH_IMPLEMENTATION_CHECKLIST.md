# Authentication Implementation Checklist

**Quick Reference for Implementation**

---

## Pre-Implementation

- [ ] Read `AUTHENTICATION_REMEDIATION_PLAN.md` completely
- [ ] Back up current database
- [ ] Create git branch: `fix/authentication-security`
- [ ] Set up test environment
- [ ] Notify team of upcoming changes

---

## Phase 1: Critical Security Fixes (1 hour)

### 1.1 Secure Admin Creation Endpoint
- [x] Add `isChimariEmail()` function to `server/middleware/rbac.ts`
- [x] Add `requireAdminSetupPermission` middleware to `server/routes/auth.ts`
- [x] Update `/api/auth/setup-admin` endpoint with security checks
- [ ] Add environment variables: `ALLOW_ADMIN_SETUP`, `ADMIN_SETUP_ALLOWED_IPS`
- [ ] Test: Admin creation blocked in production
- [ ] Test: Admin creation allowed in dev with flag

### 1.2 Create Unified Admin Function
- [x] Add `isUserAdmin()` to `server/middleware/rbac.ts`
- [x] Include email domain validation
- [x] Add `requireAdmin` middleware (replaces legacy)
- [x] Export functions
- [ ] Write unit tests in `tests/unit/auth/admin-validation.test.ts`
- [ ] Run tests: `npm run test:unit`

### 1.3 Update Ownership Middleware
- [x] Import `isUserAdmin` in `server/middleware/ownership.ts`
- [x] Replace manual admin check with `isUserAdmin(user)`
- [ ] Test project access with admin user
- [ ] Test project access with regular user

---

## Phase 2: Standardize Admin Checking (2 hours)

### 2.1 Update Admin Routes (Critical Files First)
- [x] `server/routes/admin.ts` - Replace `requireAdminLegacy`
- [ ] `server/routes/admin-billing.ts`
- [ ] `server/routes/admin-consultation.ts`
- [ ] `server/routes/admin-consultation-pricing.ts`
- [ ] `server/routes/admin-service-pricing.ts`

**Pattern to Use:**
```typescript
import { requireAdmin } from '../middleware/rbac';
// Replace: router.use(ensureAuthenticated, requireAdminLegacy)
// With: router.use(ensureAuthenticated, requireAdmin)
```

### 2.2 Update All Other Admin Routes
- [ ] Search codebase: `grep -r "requireAdminLegacy" server/routes/`
- [ ] Replace each occurrence with `requireAdmin`
- [ ] Search codebase: `grep -r "isAdmin" server/routes/`
- [ ] Replace manual checks with `isUserAdmin(req.user)`
- [ ] Test each modified route

---

## Phase 3: Fix OAuth Issues (1 hour)

### 3.1 Server-Side OAuth Fix
- [ ] Update `server/routes/auth.ts:77-84`
- [ ] Add try-catch wrapper
- [ ] Return structured response: `{ success, providers, count }`
- [ ] Add error logging
- [ ] Test endpoint: `curl http://localhost:5000/api/auth/providers`

### 3.2 Client-Side OAuth Fix
- [ ] Update `client/src/components/oauth-providers.tsx`
- [ ] Add try-catch for fetch
- [ ] Handle empty/invalid responses gracefully
- [ ] Add loading state
- [ ] Test with network failure simulation

---

## Phase 4: Cleanup (30 minutes)

### 4.1 Delete Unused Files
- [ ] Delete `server/auth.ts`
- [ ] Delete `client/src/pages/admin-login.tsx`
- [ ] Search for imports: `grep -r "server/auth" .`
- [ ] Remove any dangling imports
- [ ] Run build: `npm run build`
- [ ] Verify no errors

### 4.2 Code Quality
- [ ] Run TypeScript check: `npm run check`
- [ ] Fix any type errors
- [ ] Run linter (if configured)
- [ ] Format code

---

## Phase 5: Testing (1.5 hours)

### 5.1 Unit Tests
- [ ] Run: `npm run test:unit`
- [ ] Verify `admin-validation.test.ts` passes
- [ ] Check coverage report
- [ ] Fix any failing tests

### 5.2 Integration Tests
- [ ] Run: `npm run test:integration`
- [ ] Test admin creation with valid email
- [ ] Test admin creation with invalid email
- [ ] Test admin creation in production mode
- [ ] Fix any failing tests

### 5.3 E2E Tests
- [ ] Run: `npm run test:auth`
- [ ] Run: `npm run test:user-journeys`
- [ ] Manual test: Registration flow
- [ ] Manual test: Login flow
- [ ] Manual test: Email verification
- [ ] Manual test: OAuth login (Google)
- [ ] Manual test: Admin access to projects
- [ ] Manual test: Non-admin blocked from projects

### 5.4 Security Testing
- [ ] Attempt admin creation without auth (prod mode) - Should FAIL
- [ ] Attempt admin creation with `user@gmail.com` - Should FAIL
- [ ] Attempt admin creation with `admin@chimaridata.com` - Should SUCCEED
- [ ] Verify existing admins with Chimari emails still work
- [ ] Test token refresh after expiry
- [ ] Test logout clears session

---

## Phase 6: Documentation & Deployment (30 minutes)

### 6.1 Documentation Updates
- [ ] Update `CLAUDE.md` authentication section
- [ ] Document new environment variables in `.env.example`
- [ ] Create `AUTHENTICATION_GUIDE.md` for developers
- [ ] Add troubleshooting section
- [ ] Update API documentation

### 6.2 Migration Preparation
- [ ] Create migration script: `scripts/migrate-admin-email-check.js`
- [ ] Run migration in DRY_RUN mode
- [ ] Review list of affected admins (if any)
- [ ] Get approval to demote non-Chimari admins
- [ ] Run migration: `DRY_RUN=false node scripts/migrate-admin-email-check.js`

### 6.3 Deployment
- [ ] Commit changes: `git commit -m "Security: Restrict admin creation and validate email domains"`
- [ ] Push to feature branch
- [ ] Create pull request
- [ ] Request code review
- [ ] Deploy to staging environment
- [ ] Test in staging
- [ ] Deploy to production
- [ ] Monitor logs for 1 hour post-deployment

---

## Post-Deployment Monitoring

### Immediate (First Hour)
- [ ] Check error logs: No auth failures
- [ ] Verify admin users can access admin routes
- [ ] Check OAuth login working
- [ ] Monitor for 401/403 errors

### Day 1
- [ ] Review audit logs for admin creation attempts
- [ ] Check user feedback/support tickets
- [ ] Verify all admin functions working
- [ ] Document any issues

### Week 1
- [ ] Review usage patterns
- [ ] Collect team feedback
- [ ] Update documentation based on learnings
- [ ] Plan Phase 2 improvements (2FA, password strength)

---

## Rollback Procedure (If Needed)

### Quick Rollback
```bash
# 1. Revert to previous commit
git revert HEAD

# 2. Redeploy
npm run build
pm2 restart all  # Or your deployment method

# 3. Verify
curl http://localhost:5000/api/auth/providers
```

### Partial Rollback (Admin Endpoint Only)
- [ ] Comment out `requireAdminSetupPermission` middleware
- [ ] Redeploy
- [ ] Monitor logs

### Database Rollback (If Migration Ran)
```sql
-- Restore demoted admins (if needed)
UPDATE users
SET isAdmin = true, role = 'admin'
WHERE email IN ('admin1@example.com', 'admin2@example.com');
```

---

## Success Verification

After implementation, verify:

- ✅ Admin creation requires Chimari email
- ✅ Admin creation blocked in production (unless flag enabled)
- ✅ All admin routes use unified `isUserAdmin()` check
- ✅ OAuth providers load without errors
- ✅ Existing admins (with Chimari emails) retain access
- ✅ All tests pass
- ✅ No TypeScript errors
- ✅ Documentation updated

---

## Key Files Modified

1. `server/middleware/rbac.ts` - Added admin validation functions
2. `server/routes/auth.ts` - Secured admin creation endpoint
3. `server/middleware/ownership.ts` - Use unified admin check
4. `server/routes/admin*.ts` - Standardized admin middleware
5. `client/src/components/oauth-providers.tsx` - Better error handling

## Files Deleted

1. `server/auth.ts` (empty placeholder)
2. `client/src/pages/admin-login.tsx` (empty, unused)

## Files Created

1. `tests/unit/auth/admin-validation.test.ts` - Unit tests
2. `scripts/migrate-admin-email-check.js` - Migration script
3. `AUTHENTICATION_REMEDIATION_PLAN.md` - Detailed plan
4. `AUTHENTICATION_GUIDE.md` - Developer guide

---

## Contacts & Resources

- **Documentation**: `AUTHENTICATION_REMEDIATION_PLAN.md`
- **Issues**: GitHub Issues
- **Emergency**: See rollback procedure above
- **Questions**: Development Team

---

**Estimated Total Time**: 6 hours
**Recommended Approach**: Implement in phases, test thoroughly between phases
**Risk Level**: Medium (production auth changes)

