import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Save,
  X,
  RefreshCw,
  Clock
} from "lucide-react";
import { useOptimizedAuth } from "@/hooks/useOptimizedAuth";

interface ConsultationPricingTier {
  id: string;
  consultationType: string;
  displayName: string;
  description: string | null;
  basePrice: number; // in cents
  expertLevel: string;
  durationHours: number;
  features: string[] | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminConsultationPricing() {
  const { isAuthenticated, user, token } = useOptimizedAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [pricingTiers, setPricingTiers] = useState<ConsultationPricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [formData, setFormData] = useState({
    consultationType: '',
    displayName: '',
    description: '',
    basePrice: '',
    expertLevel: 'senior',
    durationHours: '1',
    features: '',
    sortOrder: '0',
  });

  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      loadPricingTiers();
    }
  }, [isAuthenticated, isAdmin, includeInactive]);

  const loadPricingTiers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/consultation-pricing?includeInactive=${includeInactive}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load consultation pricing');
      }

      const data = await response.json();
      setPricingTiers(data.pricingTiers || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load pricing tiers');
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDefaults = async () => {
    try {
      const response = await fetch('/api/admin/consultation-pricing/seed-defaults', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to seed default pricing tiers');
      }

      const data = await response.json();
      alert(`✅ ${data.message}`);
      loadPricingTiers();
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleCreate = async () => {
    try {
      const features = formData.features
        ? formData.features.split('\n').filter(f => f.trim())
        : [];

      const response = await fetch('/api/admin/consultation-pricing', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          consultationType: formData.consultationType,
          displayName: formData.displayName,
          description: formData.description || null,
          basePrice: parseFloat(formData.basePrice) * 100, // Convert dollars to cents
          expertLevel: formData.expertLevel,
          durationHours: parseInt(formData.durationHours),
          features: features.length > 0 ? JSON.stringify(features) : null,
          sortOrder: parseInt(formData.sortOrder),
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create pricing tier');
      }

      alert('✅ Pricing tier created successfully');
      setShowNewForm(false);
      resetForm();
      loadPricingTiers();
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const tier = pricingTiers.find(t => t.id === id);
      if (!tier) return;

      const features = formData.features
        ? formData.features.split('\n').filter(f => f.trim())
        : [];

      const response = await fetch(`/api/admin/consultation-pricing/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: formData.displayName,
          description: formData.description || null,
          basePrice: parseFloat(formData.basePrice) * 100, // Convert dollars to cents
          expertLevel: formData.expertLevel,
          durationHours: parseInt(formData.durationHours),
          features: features.length > 0 ? JSON.stringify(features) : null,
          sortOrder: parseInt(formData.sortOrder),
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update pricing tier');
      }

      alert('✅ Pricing tier updated successfully');
      setEditingId(null);
      resetForm();
      loadPricingTiers();
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this pricing tier?')) return;

    try {
      const response = await fetch(`/api/admin/consultation-pricing/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to deactivate pricing tier');
      }

      alert('✅ Pricing tier deactivated');
      loadPricingTiers();
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/consultation-pricing/${id}/activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to activate pricing tier');
      }

      alert('✅ Pricing tier activated');
      loadPricingTiers();
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    }
  };

  const startEdit = (tier: ConsultationPricingTier) => {
    setEditingId(tier.id);
    setFormData({
      consultationType: tier.consultationType,
      displayName: tier.displayName,
      description: tier.description || '',
      basePrice: (tier.basePrice / 100).toString(), // Convert cents to dollars
      expertLevel: tier.expertLevel,
      durationHours: tier.durationHours.toString(),
      features: tier.features ? tier.features.join('\n') : '',
      sortOrder: tier.sortOrder.toString(),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowNewForm(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      consultationType: '',
      displayName: '',
      description: '',
      basePrice: '',
      expertLevel: 'senior',
      durationHours: '1',
      features: '',
      sortOrder: '0',
    });
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  };

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You must be an admin to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Consultation Pricing Management</h1>
          <p className="text-gray-600 mt-1">Configure pricing tiers for expert consultation services</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIncludeInactive(!includeInactive)}
            className="flex items-center gap-2"
          >
            {includeInactive ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {includeInactive ? 'Showing All' : 'Active Only'}
          </Button>
          <Button
            variant="outline"
            onClick={loadPricingTiers}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={handleSeedDefaults}
            className="flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Seed Defaults
          </Button>
          <Button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Pricing Tier
          </Button>
        </div>
      </div>

      {loading && (
        <Card>
          <CardContent className="py-8 text-center text-gray-600">
            Loading pricing tiers...
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 text-red-800">
            ❌ {error}
          </CardContent>
        </Card>
      )}

      {/* New Tier Form */}
      {showNewForm && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Plus className="w-5 h-5" />
              Create New Pricing Tier
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="new-consultation-type">Consultation Type (ID) *</Label>
                <Input
                  id="new-consultation-type"
                  value={formData.consultationType}
                  onChange={(e) => setFormData({ ...formData, consultationType: e.target.value })}
                  placeholder="e.g., premium, enterprise"
                />
              </div>
              <div>
                <Label htmlFor="new-display-name">Display Name *</Label>
                <Input
                  id="new-display-name"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="e.g., Premium Consultation"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="new-description">Description</Label>
                <Textarea
                  id="new-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this consultation tier..."
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="new-base-price">Base Price (USD) *</Label>
                <Input
                  id="new-base-price"
                  type="number"
                  step="0.01"
                  value={formData.basePrice}
                  onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                  placeholder="299.00"
                />
              </div>
              <div>
                <Label htmlFor="new-expert-level">Expert Level</Label>
                <select
                  id="new-expert-level"
                  value={formData.expertLevel}
                  onChange={(e) => setFormData({ ...formData, expertLevel: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="junior">Junior</option>
                  <option value="senior">Senior</option>
                  <option value="principal">Principal</option>
                </select>
              </div>
              <div>
                <Label htmlFor="new-duration">Duration (hours)</Label>
                <Input
                  id="new-duration"
                  type="number"
                  value={formData.durationHours}
                  onChange={(e) => setFormData({ ...formData, durationHours: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="new-sort-order">Sort Order</Label>
                <Input
                  id="new-sort-order"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="new-features">Features (one per line)</Label>
                <Textarea
                  id="new-features"
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
                  rows={4}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleCreate} className="bg-green-600 hover:bg-green-700">
                <Save className="w-4 h-4 mr-2" />
                Create Tier
              </Button>
              <Button onClick={cancelEdit} variant="outline">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Tiers List */}
      {!loading && pricingTiers.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-gray-600">
            No pricing tiers found. Click "Seed Defaults" to create initial tiers or "New Pricing Tier" to create custom ones.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {pricingTiers.map((tier) => (
          <Card key={tier.id} className={!tier.isActive ? 'opacity-60' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    {tier.displayName}
                  </CardTitle>
                  <Badge variant={tier.isActive ? 'default' : 'secondary'} className={tier.isActive ? 'bg-green-600' : 'bg-gray-400'}>
                    {tier.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge variant="outline">{tier.expertLevel}</Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {tier.durationHours}h
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {editingId === tier.id ? (
                    <>
                      <Button onClick={() => handleUpdate(tier.id)} size="sm" className="bg-green-600 hover:bg-green-700">
                        <Save className="w-4 h-4 mr-1" />
                        Save
                      </Button>
                      <Button onClick={cancelEdit} size="sm" variant="outline">
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => startEdit(tier)} size="sm" variant="outline">
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      {tier.isActive ? (
                        <Button onClick={() => handleDeactivate(tier.id)} size="sm" variant="outline" className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-1" />
                          Deactivate
                        </Button>
                      ) : (
                        <Button onClick={() => handleActivate(tier.id)} size="sm" variant="outline" className="text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Activate
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {tier.description && (
                <CardDescription>{tier.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {editingId === tier.id ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Display Name</Label>
                    <Input
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Base Price (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.basePrice}
                      onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label>Expert Level</Label>
                    <select
                      value={formData.expertLevel}
                      onChange={(e) => setFormData({ ...formData, expertLevel: e.target.value })}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="junior">Junior</option>
                      <option value="senior">Senior</option>
                      <option value="principal">Principal</option>
                    </select>
                  </div>
                  <div>
                    <Label>Duration (hours)</Label>
                    <Input
                      type="number"
                      value={formData.durationHours}
                      onChange={(e) => setFormData({ ...formData, durationHours: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Sort Order</Label>
                    <Input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Features (one per line)</Label>
                    <Textarea
                      value={formData.features}
                      onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                      rows={4}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-600">Price:</span>
                      <span className="ml-2 font-bold text-2xl text-blue-600">{formatCurrency(tier.basePrice)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Type:</span>
                      <span className="ml-2 font-medium">{tier.consultationType}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Sort Order:</span>
                      <span className="ml-2 font-medium">{tier.sortOrder}</span>
                    </div>
                  </div>

                  {tier.features && tier.features.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-700 mb-2">Features:</h4>
                      <ul className="grid grid-cols-2 gap-2">
                        {tier.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
