# ChimariData File Cleanup Plan

## 🚨 CRITICAL ISSUES IDENTIFIED

### Bundle Size Issues:
- **Main Bundle**: 5.7MB (Too large!)
- **Dynamic Import Issues**: Same modules imported both statically and dynamically
- **Poor Code Splitting**: Everything bundled into one chunk

## FILES FOR REMOVAL (Post-Testing)

### 1. Duplicate/Legacy Pages
- `pages/home-page.tsx` (superseded by main-landing.tsx)
- `pages/landing.tsx` (superseded by main-landing.tsx)  
- `pages/journeys-hub.tsx` (consolidated to main-landing.tsx)
- `pages/pricing-broken.tsx` (legacy)
- `pages/pricing-v2.tsx` (legacy)
- `pages/subscribe.tsx` (superseded by pricing.tsx)
- `pages/enterprise-contact.tsx` (redirects to expert-consultation.tsx)
- `pages/settings-page.tsx` (duplicate of settings.tsx)
- `pages/auth-login.tsx` (covered by auth.tsx)
- `pages/demo.tsx` (covered by demos.tsx)
- `pages/data-step.tsx` (covered by JourneyWizard)
- `pages/prepare-step.tsx` (covered by JourneyWizard)
- `pages/execute-step.tsx` (covered by JourneyWizard)
- `pages/project-setup-step.tsx` (covered by JourneyWizard)
- `pages/pricing-step.tsx` (covered by JourneyWizard)
- `pages/results-step.tsx` (covered by JourneyWizard)
- `pages/coming-soon.tsx` (unused)
- `pages/not-found.tsx` (can be inline)

### 2. Unused/Redundant Components
- `components/AuthModal.tsx` (auth handled in pages/auth.tsx)
- `components/journey-selector.tsx` (consolidated to main-landing.tsx)
- `components/animated-demo.tsx` (potentially unused)
- `components/FreeTrialWorkflow.tsx` (check if used)
- `components/EnhancedTrialWorkflow.tsx` (potentially duplicate)
- `components/CostChip.tsx` (small, can be inline)
- `components/SecurityScan.tsx` (check usage)
- `components/DatasetSelector.tsx` (check usage)
- `components/ErrorDisplay.tsx` (can be inline)
- `components/RoleBasedNavigation.tsx` (check usage)
- `components/UserTypeOnboarding.tsx` (check usage)
- `components/WorkflowSteps.tsx` (check usage)

### 3. UI Components (Consider Removal)
- `components/ui/aspect-ratio.tsx` (unused)
- `components/ui/breadcrumb.tsx` (unused)
- `components/ui/calendar.tsx` (unused)
- `components/ui/carousel.tsx` (unused)
- `components/ui/collapsible.tsx` (unused)
- `components/ui/command.tsx` (unused)
- `components/ui/context-menu.tsx` (unused)
- `components/ui/drawer.tsx` (unused)
- `components/ui/hover-card.tsx` (unused)
- `components/ui/input-otp.tsx` (unused)
- `components/ui/menubar.tsx` (unused)
- `components/ui/navigation-menu.tsx` (unused)
- `components/ui/pagination.tsx` (unused)
- `components/ui/resizable.tsx` (unused)
- `components/ui/sheet.tsx` (unused)
- `components/ui/sidebar.tsx` (unused)
- `components/ui/skeleton.tsx` (unused)
- `components/ui/toggle.tsx` (unused)
- `components/ui/toggle-group.tsx` (unused)

### 4. Hooks (Check Usage)
- `hooks/useErrorHandler.ts` (check usage)
- `hooks/use-mobile.tsx` (check usage)
- `hooks/useOptimizedAuth.ts` (check usage)
- `hooks/useRealtimeUpdates.ts` (check usage)

## BEFORE REMOVAL - VERIFICATION NEEDED

1. **Run comprehensive tests** to ensure no functionality is lost
2. **Check imports** - search for each file in codebase
3. **Test all user journeys** to ensure nothing breaks
4. **Verify routing** - ensure all routes still work

## BUNDLE OPTIMIZATION PRIORITY

### Step 1: Fix Dynamic Import Issues
- Remove duplicate imports in App.tsx
- Convert to proper lazy loading

### Step 2: Implement Code Splitting
- Split by user journey type
- Lazy load heavy components
- Separate vendor chunks

### Step 3: Remove Unused Files
- After testing, remove identified files
- Update imports and routes

## EXPECTED IMPACT

- **Bundle Size**: 5.7MB → ~2MB (65% reduction)
- **Load Time**: 19+ seconds → <3 seconds
- **Development**: Faster builds, better HMR
- **Maintenance**: Cleaner codebase

## TESTING CHECKLIST

- [ ] All user journeys work
- [ ] Authentication flow complete
- [ ] Project creation/management
- [ ] Payment processing
- [ ] Analysis workflows
- [ ] WebSocket functionality
- [ ] Mobile responsiveness
