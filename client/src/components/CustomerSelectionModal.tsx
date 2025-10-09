import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { Search, User, Mail, Building, Check, UserPlus } from "lucide-react";

interface CustomerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomer: (customer: {
    id: string;
    name: string;
    email: string;
    company?: string;
  }) => void;
}

interface Customer {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  createdAt: string;
}

export function CustomerSelectionModal({ 
  isOpen, 
  onClose, 
  onSelectCustomer 
}: CustomerSelectionModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState("select");
  
  // New customer form state
  const [newCustomerForm, setNewCustomerForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    company: "",
    password: ""
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  
  const { toast } = useToast();

  // Fetch customers when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
    }
  }, [isOpen]);

  // Filter customers based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCustomers(customers);
    } else {
      const filtered = customers.filter(customer => 
        customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.company?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCustomers(filtered);
    }
  }, [searchQuery, customers]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      // Fetch all users (in a real app, this would be a proper admin API)
      // Mock users data for now - replace with actual API call when available
      const mockUsers = [
        {
          id: '1',
          email: 'john.doe@example.com',
          firstName: 'John',
          lastName: 'Doe',
          company: 'Acme Corp',
          subscriptionTier: 'professional',
          subscriptionStatus: 'active',
          createdAt: '2024-01-15T10:00:00Z'
        },
        {
          id: '2',
          email: 'jane.smith@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          company: 'Tech Solutions',
          subscriptionTier: 'starter',
          subscriptionStatus: 'active',
          createdAt: '2024-02-20T14:30:00Z'
        }
      ];
      const response = { data: mockUsers };
      if (response.data) {
        // Filter out admin users and only show regular customers
        const customerUsers = response.data.filter((user: any) => !user.isAdmin);
        setCustomers(customerUsers);
        setFilteredCustomers(customerUsers);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        title: "Error",
        description: "Failed to fetch customers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCustomer = () => {
    if (selectedCustomer) {
      const customerName = selectedCustomer.firstName && selectedCustomer.lastName 
        ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}`
        : selectedCustomer.email.split('@')[0];
      
      onSelectCustomer({
        id: selectedCustomer.id,
        name: customerName,
        email: selectedCustomer.email,
        company: selectedCustomer.company
      });
      
      // Reset state
      setSelectedCustomer(null);
      setSearchQuery("");
      setActiveTab("select");
      onClose();
    }
  };

  const handleCreateCustomer = async () => {
    // Validate form
    if (!newCustomerForm.email || !newCustomerForm.firstName || !newCustomerForm.lastName || !newCustomerForm.password) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setCreatingCustomer(true);
    try {
      // Create new customer using the existing register endpoint
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newCustomerForm.email,
          firstName: newCustomerForm.firstName,
          lastName: newCustomerForm.lastName,
          password: newCustomerForm.password,
          company: newCustomerForm.company || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create customer');
      }

      toast({
        title: "Success",
        description: `Customer ${newCustomerForm.firstName} ${newCustomerForm.lastName} created successfully`,
      });

      // Select the newly created customer
      const customerName = `${newCustomerForm.firstName} ${newCustomerForm.lastName}`;
      onSelectCustomer({
        id: data.user.id,
        name: customerName,
        email: newCustomerForm.email,
        company: newCustomerForm.company
      });

      // Reset form and close
      setNewCustomerForm({
        email: "",
        firstName: "",
        lastName: "",
        company: "",
        password: ""
      });
      setActiveTab("select");
      onClose();

      // Refresh customer list
      fetchCustomers();
    } catch (error: any) {
      console.error('Error creating customer:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create customer",
        variant: "destructive"
      });
    } finally {
      setCreatingCustomer(false);
    }
  };

  const getSubscriptionBadgeVariant = (tier: string) => {
    switch (tier) {
      case 'enterprise': return 'default';
      case 'business': return 'secondary';
      case 'professional': return 'outline';
      default: return 'outline';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Select or Create Customer
          </DialogTitle>
          <DialogDescription>
            Choose an existing customer or onboard a new one to act on their behalf.
            All projects will be attributed to the selected customer.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="select">Select Existing</TabsTrigger>
            <TabsTrigger value="create">Create New Customer</TabsTrigger>
          </TabsList>

          <TabsContent value="select" className="space-y-4 mt-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Customer List */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading customers...
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'No customers found matching your search.' : 'No customers found.'}
              </div>
            ) : (
              filteredCustomers.map((customer) => (
                <Card 
                  key={customer.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedCustomer?.id === customer.id 
                      ? 'ring-2 ring-primary bg-primary/5' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedCustomer(customer)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">
                            {customer.firstName && customer.lastName 
                              ? `${customer.firstName} ${customer.lastName}`
                              : customer.email.split('@')[0]
                            }
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </div>
                          {customer.company && (
                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                              <Building className="h-3 w-3" />
                              {customer.company}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getSubscriptionBadgeVariant(customer.subscriptionTier)}>
                          {customer.subscriptionTier}
                        </Badge>
                        {selectedCustomer?.id === customer.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Member since {formatDate(customer.createdAt)} • {customer.subscriptionStatus}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          </TabsContent>

          <TabsContent value="create" className="space-y-4 mt-4">
            <div className="text-center py-8 text-muted-foreground">
              Create new customer functionality coming soon...
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSelectCustomer}
            disabled={!selectedCustomer}
          >
            Act on Behalf of {selectedCustomer ? 
              (selectedCustomer.firstName && selectedCustomer.lastName 
                ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}`
                : selectedCustomer.email.split('@')[0]
              ) : 'Customer'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
