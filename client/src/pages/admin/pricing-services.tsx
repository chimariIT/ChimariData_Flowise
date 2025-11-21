/**
 * Admin Service Pricing Management Page
 * 
 * Allows admins to configure pricing for one-time services
 * (pay-per-analysis, expert consultation, etc.)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, DollarSign, Edit, Plus, Check, X } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ServicePricing {
  id: string;
  serviceType: string;
  displayName: string;
  description?: string;
  basePrice: number; // in cents
  pricingModel: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PricingServicesPageProps {
  onBack: () => void;
}

export default function PricingServicesPage({ onBack }: PricingServicesPageProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ServicePricing>>({});

  // Fetch service pricing from database
  const { data, isLoading } = useQuery({
    queryKey: ['/api/admin/service-pricing'],
    queryFn: () => apiClient.get('/api/admin/service-pricing'),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ServicePricing> }) => {
      return apiClient.put(`/api/admin/service-pricing/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/service-pricing'] });
      setEditingId(null);
      toast({ title: "Success", description: "Service pricing updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update service pricing", variant: "destructive" });
    },
  });

  const handleEdit = (service: ServicePricing) => {
    setEditingId(service.id);
    setFormData({
      displayName: service.displayName,
      description: service.description,
      basePrice: service.basePrice,
      pricingModel: service.pricingModel,
      isActive: service.isActive,
    });
  };

  const handleSave = () => {
    if (editingId && formData) {
      updateMutation.mutate({ id: editingId, data: formData });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({});
  };

  const services: ServicePricing[] = data?.services || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button onClick={onBack} variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </Button>
          <h1 className="text-3xl font-bold mb-2">Service Pricing Management</h1>
          <p className="text-muted-foreground">Configure pricing for one-time services</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="grid gap-6">
            {services.map((service) => {
              const isEditing = editingId === service.id;
              const priceInDollars = (service.basePrice / 100).toFixed(2);

              return (
                <Card key={service.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <DollarSign className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle>{service.displayName}</CardTitle>
                          <CardDescription>{service.serviceType}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={service.isActive ? "default" : "secondary"}>
                          {service.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {!isEditing && (
                          <Button onClick={() => handleEdit(service)} variant="outline" size="sm">
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isEditing ? (
                      <div className="space-y-4">
                        <div>
                          <Label>Display Name</Label>
                          <Input
                            value={formData.displayName || ""}
                            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Description</Label>
                          <Input
                            value={formData.description || ""}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Base Price (cents)</Label>
                          <Input
                            type="number"
                            value={formData.basePrice || 0}
                            onChange={(e) => setFormData({ ...formData, basePrice: parseInt(e.target.value) })}
                          />
                          <p className="text-sm text-muted-foreground mt-1">
                            Current: ${priceInDollars} (${(service.basePrice / 100).toFixed(2)})
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={handleSave} disabled={updateMutation.isPending}>
                            <Check className="w-4 h-4 mr-2" />
                            Save
                          </Button>
                          <Button onClick={handleCancel} variant="outline" disabled={updateMutation.isPending}>
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">{service.description}</p>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="font-medium">Pricing Model:</span>
                          <Badge variant="outline">{service.pricingModel}</Badge>
                          <span className="font-medium">Price:</span>
                          <span className="text-2xl font-bold text-primary">${priceInDollars}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


