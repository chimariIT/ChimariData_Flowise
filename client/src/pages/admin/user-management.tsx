/**
 * Admin User Management Page
 * P2-1: Full CRUD for users, subscriptions, credits, and roles
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Users,
  Search,
  Shield,
  ShieldOff,
  CreditCard,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  UserCog,
  Coins,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch users from admin endpoint
  const { data: usersData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/admin/users", page, searchQuery, roleFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      if (searchQuery) params.set("search", searchQuery);
      if (roleFilter !== "all") params.set("role", roleFilter);
      const response = await apiClient.get(`/api/admin/users?${params.toString()}`);
      return response?.data || response;
    },
    staleTime: 15000,
  });

  const users = usersData?.users || usersData || [];
  const totalCount = usersData?.total || users.length;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Mutations
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiClient.put(`/api/admin/users/${userId}`, { role });
    },
    onSuccess: () => {
      toast({ title: "Role Updated", description: "User role has been changed." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update role", variant: "destructive" });
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      return apiClient.put(`/api/admin/users/${userId}`, { isAdmin });
    },
    onSuccess: () => {
      toast({ title: "Admin Status Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to toggle admin", variant: "destructive" });
    },
  });

  const changeSubscriptionMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      return apiClient.put(`/api/admin/users/${userId}/subscription`, { tier });
    },
    onSuccess: () => {
      toast({ title: "Subscription Updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to change subscription", variant: "destructive" });
    },
  });

  const awardCreditsMutation = useMutation({
    mutationFn: async ({ userId, amount, reason }: { userId: string; amount: number; reason: string }) => {
      return apiClient.post(`/api/admin/users/${userId}/credits`, { amount, reason });
    },
    onSuccess: () => {
      toast({ title: "Credits Awarded" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to award credits", variant: "destructive" });
    },
  });

  const getTierBadgeColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case "enterprise": return "bg-purple-100 text-purple-800";
      case "professional": return "bg-blue-100 text-blue-800";
      case "starter": return "bg-green-100 text-green-800";
      case "trial": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            User Management
          </CardTitle>
          <CardDescription>
            Manage platform users, roles, subscriptions, and credits. Total: {totalCount} users
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search & Filter Bar */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="non-tech">Non-Tech</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="consultation">Consultation</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>Failed to load users: {(error as any)?.message}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading users...
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(users) && users.length > 0 ? users.map((user: any) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{user.name || user.displayName || "—"}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.role || "non-tech"}
                            onValueChange={(role) => updateRoleMutation.mutate({ userId: user.id, role })}
                          >
                            <SelectTrigger className="w-[130px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="non-tech">Non-Tech</SelectItem>
                              <SelectItem value="business">Business</SelectItem>
                              <SelectItem value="technical">Technical</SelectItem>
                              <SelectItem value="consultation">Consultation</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge className={getTierBadgeColor(user.subscriptionTier)}>
                            {user.subscriptionTier || "trial"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleAdminMutation.mutate({ userId: user.id, isAdmin: !user.isAdmin })}
                            title={user.isAdmin ? "Remove admin" : "Make admin"}
                          >
                            {user.isAdmin ? (
                              <Shield className="w-4 h-4 text-green-600" />
                            ) : (
                              <ShieldOff className="w-4 h-4 text-gray-400" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const tier = prompt("Enter new tier (trial, starter, professional, enterprise):");
                                if (tier) changeSubscriptionMutation.mutate({ userId: user.id, tier });
                              }}
                              title="Change subscription"
                            >
                              <CreditCard className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const amount = prompt("Enter credits to award (negative to revoke):");
                                if (amount) awardCreditsMutation.mutate({ userId: user.id, amount: Number(amount), reason: "Admin award" });
                              }}
                              title="Award credits"
                            >
                              <Coins className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          No users found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-500">
                    Page {page} of {totalPages} ({totalCount} users)
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
