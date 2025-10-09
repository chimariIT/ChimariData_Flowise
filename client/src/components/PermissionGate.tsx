import { ReactNode } from "react";
import { useUserRole, UserPermissions } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, ArrowUp, Sparkles } from "lucide-react";

interface PermissionGateProps {
  children: ReactNode;
  permission?: keyof UserPermissions;
  journeyType?: string;
  role?: string[];
  subscriptionTier?: string[];
  fallback?: ReactNode;
  showUpgradePrompt?: boolean;
  upgradeMessage?: string;
}

export function PermissionGate({
  children,
  permission,
  journeyType,
  role,
  subscriptionTier,
  fallback,
  showUpgradePrompt = true,
  upgradeMessage
}: PermissionGateProps) {
  const { userRoleData, hasPermission, canAccessJourney } = useUserRole();

  if (!userRoleData) {
    return <div>Loading permissions...</div>;
  }

  let hasAccess = true;

  // Check permission-based access
  if (permission && !hasPermission(permission)) {
    hasAccess = false;
  }

  // Check journey-based access
  if (journeyType && !canAccessJourney(journeyType)) {
    hasAccess = false;
  }

  // Check role-based access
  if (role && !role.includes(userRoleData.userRole)) {
    hasAccess = false;
  }

  // Check subscription tier access
  if (subscriptionTier && !subscriptionTier.includes(userRoleData.subscriptionTier)) {
    hasAccess = false;
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  // Show custom fallback if provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show upgrade prompt by default
  if (showUpgradePrompt) {
    return (
      <UpgradePrompt
        permission={permission}
        journeyType={journeyType}
        requiredRole={role}
        requiredSubscription={subscriptionTier}
        message={upgradeMessage}
      />
    );
  }

  // Don't render anything if no access and no fallback
  return null;
}

interface UpgradePromptProps {
  permission?: keyof UserPermissions;
  journeyType?: string;
  requiredRole?: string[];
  requiredSubscription?: string[];
  message?: string;
}

function UpgradePrompt({
  permission,
  journeyType,
  requiredRole,
  requiredSubscription,
  message
}: UpgradePromptProps) {
  const { userRoleData } = useUserRole();

  const getUpgradeMessage = () => {
    if (message) return message;

    if (permission) {
      return `This feature requires ${permission.replace(/([A-Z])/g, ' $1').toLowerCase()} permission.`;
    }

    if (journeyType) {
      return `Access to ${journeyType} journey is not available with your current plan.`;
    }

    if (requiredRole) {
      return `This feature is available for ${requiredRole.join(", ")} users.`;
    }

    if (requiredSubscription) {
      return `This feature requires ${requiredSubscription.join(" or ")} subscription.`;
    }

    return "This feature is not available with your current plan.";
  };

  const getUpgradeAction = () => {
    if (requiredSubscription && !requiredSubscription.includes("none")) {
      return {
        text: "Upgrade Subscription",
        href: "/pricing",
        variant: "default" as const
      };
    }

    if (requiredRole) {
      return {
        text: "Change User Type",
        href: "/settings",
        variant: "outline" as const
      };
    }

    return {
      text: "View Plans",
      href: "/pricing",
      variant: "default" as const
    };
  };

  const upgradeAction = getUpgradeAction();

  return (
    <Card className="border-dashed border-2 border-gray-300">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
          <Lock className="w-6 h-6 text-gray-400" />
        </div>
        <CardTitle className="text-lg text-gray-700">
          Feature Locked
        </CardTitle>
        <CardDescription className="text-gray-500">
          {getUpgradeMessage()}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="text-xs">
            Current: {userRoleData?.userRole} • {userRoleData?.subscriptionTier}
          </Badge>
        </div>
        <Button asChild className="w-full" variant={upgradeAction.variant}>
          <a href={upgradeAction.href}>
            {upgradeAction.variant === "default" ? (
              <ArrowUp className="w-4 h-4 mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {upgradeAction.text}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

// Convenience components for common permission checks
export function RequirePermission({
  permission,
  children,
  fallback,
  upgradeMessage
}: {
  permission: keyof UserPermissions;
  children: ReactNode;
  fallback?: ReactNode;
  upgradeMessage?: string;
}) {
  return (
    <PermissionGate
      permission={permission}
      fallback={fallback}
      upgradeMessage={upgradeMessage}
    >
      {children}
    </PermissionGate>
  );
}

export function RequireJourney({
  journeyType,
  children,
  fallback,
  upgradeMessage
}: {
  journeyType: string;
  children: ReactNode;
  fallback?: ReactNode;
  upgradeMessage?: string;
}) {
  return (
    <PermissionGate
      journeyType={journeyType}
      fallback={fallback}
      upgradeMessage={upgradeMessage}
    >
      {children}
    </PermissionGate>
  );
}

export function RequireRole({
  role,
  children,
  fallback,
  upgradeMessage
}: {
  role: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
  upgradeMessage?: string;
}) {
  const roles = Array.isArray(role) ? role : [role];
  return (
    <PermissionGate
      role={roles}
      fallback={fallback}
      upgradeMessage={upgradeMessage}
    >
      {children}
    </PermissionGate>
  );
}

export function RequireSubscription({
  tier,
  children,
  fallback,
  upgradeMessage
}: {
  tier: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
  upgradeMessage?: string;
}) {
  const tiers = Array.isArray(tier) ? tier : [tier];
  return (
    <PermissionGate
      subscriptionTier={tiers}
      fallback={fallback}
      upgradeMessage={upgradeMessage}
    >
      {children}
    </PermissionGate>
  );
}