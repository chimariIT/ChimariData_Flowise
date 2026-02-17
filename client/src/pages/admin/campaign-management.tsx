// client/src/pages/admin/campaign-management.tsx
/**
 * Campaign Management Admin Page
 * CRUD for billing campaigns (coupons, discounts, trial extensions, quota boosts).
 * Backend: server/routes/admin-billing.ts — all endpoints already exist.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tag,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Save,
  X,
  RefreshCw,
  Copy,
  AlertTriangle,
  Percent,
  DollarSign,
  Clock,
  Users,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useOptimizedAuth } from "@/hooks/useOptimizedAuth";

// ==========================================
// Types
// ==========================================

type CampaignType = 'percentage_discount' | 'fixed_discount' | 'trial_extension' | 'quota_boost';

interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  value: number;
  targetTiers: string[] | null;
  targetRoles: string[] | null;
  validFrom: string;
  validTo: string;
  maxUses: number | null;
  currentUses: number;
  couponCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const CAMPAIGN_TYPE_OPTIONS: { value: CampaignType; label: string; icon: typeof Percent }[] = [
  { value: 'percentage_discount', label: 'Percentage Discount', icon: Percent },
  { value: 'fixed_discount', label: 'Fixed Discount (cents)', icon: DollarSign },
  { value: 'trial_extension', label: 'Trial Extension (days)', icon: Clock },
  { value: 'quota_boost', label: 'Quota Boost', icon: Users },
];

const TIER_OPTIONS = ['free', 'starter', 'professional', 'enterprise'];

// ==========================================
// Component
// ==========================================

export default function CampaignManagement() {
  const { isAuthenticated, user } = useOptimizedAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dialog state
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'percentage_discount' as CampaignType,
    value: '',
    couponCode: '',
    validFrom: '',
    validTo: '',
    maxUses: '',
    targetTiers: [] as string[],
    isActive: true,
  });

  // ==========================================
  // Auth helpers
  // ==========================================

  const getAuthHeaders = (extra: Record<string, string> = {}) => {
    const authToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    return authToken
      ? { ...extra, Authorization: `Bearer ${authToken}` }
      : { ...extra };
  };

  // ==========================================
  // Data loading
  // ==========================================

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadCampaigns();
    }
  }, [isAuthenticated, isAdmin]);

  const loadCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/billing/campaigns', {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load campaigns');
      const data = await response.json();
      setCampaigns(data.campaigns || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // CRUD operations
  // ==========================================

  const openCreateForm = () => {
    setEditingCampaign(null);
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    setFormData({
      name: '',
      type: 'percentage_discount',
      value: '',
      couponCode: '',
      validFrom: now.toISOString().slice(0, 16),
      validTo: thirtyDaysLater.toISOString().slice(0, 16),
      maxUses: '',
      targetTiers: [],
      isActive: true,
    });
    setShowForm(true);
  };

  const openEditForm = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      type: campaign.type,
      value: String(campaign.value),
      couponCode: campaign.couponCode || '',
      validFrom: campaign.validFrom ? new Date(campaign.validFrom).toISOString().slice(0, 16) : '',
      validTo: campaign.validTo ? new Date(campaign.validTo).toISOString().slice(0, 16) : '',
      maxUses: campaign.maxUses !== null ? String(campaign.maxUses) : '',
      targetTiers: campaign.targetTiers || [],
      isActive: campaign.isActive,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        name: formData.name.trim(),
        type: formData.type,
        value: parseInt(formData.value) || 0,
        couponCode: formData.couponCode.trim() || undefined,
        validFrom: formData.validFrom ? new Date(formData.validFrom).toISOString() : undefined,
        validTo: formData.validTo ? new Date(formData.validTo).toISOString() : undefined,
        maxUses: formData.maxUses ? parseInt(formData.maxUses) : null,
        targetTiers: formData.targetTiers.length > 0 ? formData.targetTiers : undefined,
        isActive: formData.isActive,
      };

      // Validation
      if (!payload.name) throw new Error('Campaign name is required');
      if (!payload.value && payload.value !== 0) throw new Error('Value is required');
      if (payload.type === 'percentage_discount' && (payload.value < 0 || payload.value > 100)) {
        throw new Error('Percentage discount must be between 0 and 100');
      }
      if (payload.validFrom && payload.validTo && new Date(payload.validFrom) >= new Date(payload.validTo)) {
        throw new Error('Valid-from date must be before valid-to date');
      }

      let url: string;
      let method: string;

      if (editingCampaign) {
        url = `/api/admin/billing/campaigns/${editingCampaign.id}`;
        method = 'PUT';
      } else {
        url = '/api/admin/billing/campaigns';
        method = 'POST';
      }

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(method === 'POST' ? { campaign: payload } : payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to ${editingCampaign ? 'update' : 'create'} campaign`);
      }

      setShowForm(false);
      setSuccessMsg(editingCampaign ? 'Campaign updated successfully' : 'Campaign created successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
      loadCampaigns();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (campaign: Campaign) => {
    try {
      const response = await fetch(`/api/admin/billing/campaigns/${campaign.id}/toggle`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to toggle campaign status');
      loadCampaigns();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/admin/billing/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete campaign');
      setDeleteConfirmId(null);
      setSuccessMsg('Campaign deleted successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
      loadCampaigns();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ==========================================
  // Helpers
  // ==========================================

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isExpired = (campaign: Campaign) => {
    if (!campaign.validTo) return false;
    return new Date(campaign.validTo) < new Date();
  };

  const isExhausted = (campaign: Campaign) => {
    if (campaign.maxUses === null) return false;
    return campaign.currentUses >= campaign.maxUses;
  };

  const getTypeLabel = (type: CampaignType) => {
    return CAMPAIGN_TYPE_OPTIONS.find(o => o.value === type)?.label || type;
  };

  const getValueDisplay = (campaign: Campaign) => {
    switch (campaign.type) {
      case 'percentage_discount':
        return `${campaign.value}% off`;
      case 'fixed_discount':
        return `$${(campaign.value / 100).toFixed(2)} off`;
      case 'trial_extension':
        return `+${campaign.value} days`;
      case 'quota_boost':
        return `+${campaign.value} quota`;
      default:
        return String(campaign.value);
    }
  };

  const getStatusBadge = (campaign: Campaign) => {
    if (!campaign.isActive) {
      return <Badge variant="secondary" className="bg-gray-100 text-gray-600">Inactive</Badge>;
    }
    if (isExpired(campaign)) {
      return <Badge variant="destructive" className="bg-red-100 text-red-700">Expired</Badge>;
    }
    if (isExhausted(campaign)) {
      return <Badge variant="secondary" className="bg-amber-100 text-amber-700">Exhausted</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700">Active</Badge>;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleTierToggle = (tier: string) => {
    setFormData(prev => ({
      ...prev,
      targetTiers: prev.targetTiers.includes(tier)
        ? prev.targetTiers.filter(t => t !== tier)
        : [...prev.targetTiers, tier],
    }));
  };

  // ==========================================
  // Render
  // ==========================================

  if (!isAuthenticated || !isAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
          Admin access required
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-blue-600" />
            Campaign Management
          </h2>
          <p className="text-gray-500 mt-1">
            Create and manage discount campaigns, coupons, trial extensions, and quota boosts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadCampaigns} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openCreateForm} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={() => setError(null)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}
      {successMsg && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Total Campaigns</div>
            <div className="text-2xl font-bold">{campaigns.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Active</div>
            <div className="text-2xl font-bold text-green-600">
              {campaigns.filter(c => c.isActive && !isExpired(c) && !isExhausted(c)).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Total Redemptions</div>
            <div className="text-2xl font-bold text-blue-600">
              {campaigns.reduce((sum, c) => sum + c.currentUses, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Expired / Exhausted</div>
            <div className="text-2xl font-bold text-gray-400">
              {campaigns.filter(c => isExpired(c) || isExhausted(c)).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign List */}
      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
            Loading campaigns...
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <Tag className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No campaigns yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className={`transition-opacity ${!campaign.isActive ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">{campaign.name}</h3>
                      {getStatusBadge(campaign)}
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(campaign.type)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span className="font-medium text-blue-700">{getValueDisplay(campaign)}</span>
                      {campaign.couponCode && (
                        <span className="flex items-center gap-1 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {campaign.couponCode}
                          <button onClick={() => copyToClipboard(campaign.couponCode!)} className="hover:text-blue-600">
                            <Copy className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                      <span>
                        {formatDate(campaign.validFrom)} — {formatDate(campaign.validTo)}
                      </span>
                      <span>
                        {campaign.currentUses}{campaign.maxUses !== null ? `/${campaign.maxUses}` : ''} uses
                      </span>
                      {campaign.targetTiers && campaign.targetTiers.length > 0 && (
                        <span className="text-xs">
                          Tiers: {(campaign.targetTiers as string[]).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(campaign)}
                      title={campaign.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {campaign.isActive ? (
                        <ToggleRight className="w-4 h-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-gray-400" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditForm(campaign)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(campaign.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? 'Edit Campaign' : 'Create Campaign'}
            </DialogTitle>
            <DialogDescription>
              {editingCampaign
                ? 'Update the campaign details below.'
                : 'Fill in the details to create a new campaign.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1">
              <Label htmlFor="campaign-name">Campaign Name *</Label>
              <Input
                id="campaign-name"
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Summer 2026 Promo"
              />
            </div>

            {/* Type */}
            <div className="space-y-1">
              <Label>Campaign Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(val: CampaignType) => setFormData(f => ({ ...f, type: val }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Value */}
            <div className="space-y-1">
              <Label htmlFor="campaign-value">
                Value *
                <span className="text-xs text-gray-400 ml-1">
                  {formData.type === 'percentage_discount' && '(0-100%)'}
                  {formData.type === 'fixed_discount' && '(in cents, e.g., 500 = $5.00)'}
                  {formData.type === 'trial_extension' && '(days)'}
                  {formData.type === 'quota_boost' && '(amount)'}
                </span>
              </Label>
              <Input
                id="campaign-value"
                type="number"
                value={formData.value}
                onChange={e => setFormData(f => ({ ...f, value: e.target.value }))}
                placeholder={formData.type === 'percentage_discount' ? '20' : '500'}
                min={0}
                max={formData.type === 'percentage_discount' ? 100 : undefined}
              />
            </div>

            {/* Coupon Code */}
            <div className="space-y-1">
              <Label htmlFor="campaign-coupon">Coupon Code (optional)</Label>
              <Input
                id="campaign-coupon"
                value={formData.couponCode}
                onChange={e => setFormData(f => ({ ...f, couponCode: e.target.value.toUpperCase() }))}
                placeholder="e.g., SUMMER2026"
                className="font-mono"
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="campaign-from">Valid From</Label>
                <Input
                  id="campaign-from"
                  type="datetime-local"
                  value={formData.validFrom}
                  onChange={e => setFormData(f => ({ ...f, validFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="campaign-to">Valid To</Label>
                <Input
                  id="campaign-to"
                  type="datetime-local"
                  value={formData.validTo}
                  onChange={e => setFormData(f => ({ ...f, validTo: e.target.value }))}
                />
              </div>
            </div>

            {/* Max Uses */}
            <div className="space-y-1">
              <Label htmlFor="campaign-max">Max Uses (leave empty for unlimited)</Label>
              <Input
                id="campaign-max"
                type="number"
                value={formData.maxUses}
                onChange={e => setFormData(f => ({ ...f, maxUses: e.target.value }))}
                placeholder="Unlimited"
                min={0}
              />
            </div>

            {/* Target Tiers */}
            <div className="space-y-1">
              <Label>Target Tiers (optional — leave empty for all)</Label>
              <div className="flex flex-wrap gap-2">
                {TIER_OPTIONS.map(tier => (
                  <Badge
                    key={tier}
                    variant={formData.targetTiers.includes(tier) ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => handleTierToggle(tier)}
                  >
                    {tier}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Active */}
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={val => setFormData(f => ({ ...f, isActive: val }))}
              />
              <Label>Active immediately</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              {editingCampaign ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Delete Campaign
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this campaign? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
