import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface CustomerInfo {
  id: string;
  name: string;
  email: string;
  company?: string;
}

interface ConsultantContextType {
  isConsultantMode: boolean;
  selectedCustomer: CustomerInfo | null;
  adminConsultantId: string | null;
  setConsultantMode: (customer: CustomerInfo | null) => void;
  clearConsultantMode: () => void;
  getProjectAttribution: () => {
    createdByAdmin: boolean;
    adminConsultantId: string | null;
    customerName: string | null;
    customerEmail: string | null;
  };
}

const ConsultantContext = createContext<ConsultantContextType | undefined>(undefined);

export function ConsultantProvider({ children }: { children: ReactNode }) {
  const [isConsultantMode, setIsConsultantMode] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerInfo | null>(null);
  const [adminConsultantId, setAdminConsultantId] = useState<string | null>(null);

  // Load consultant mode state from localStorage on mount
  useEffect(() => {
    const savedConsultantMode = localStorage.getItem('consultant_mode');
    const savedCustomer = localStorage.getItem('consultant_customer');
    const savedAdminId = localStorage.getItem('admin_consultant_id');

    if (savedConsultantMode === 'true' && savedCustomer && savedAdminId) {
      try {
        setSelectedCustomer(JSON.parse(savedCustomer));
        setAdminConsultantId(savedAdminId);
        setIsConsultantMode(true);
      } catch (error) {
        console.error('Error loading consultant mode state:', error);
        clearConsultantMode();
      }
    }
  }, []);

  const setConsultantMode = (customer: CustomerInfo | null) => {
    if (customer) {
      // Get current admin user ID from localStorage
      const userData = localStorage.getItem('user');
      const adminId = userData ? JSON.parse(userData).id : null;

      setSelectedCustomer(customer);
      setAdminConsultantId(adminId);
      setIsConsultantMode(true);

      // Persist to localStorage
      localStorage.setItem('consultant_mode', 'true');
      localStorage.setItem('consultant_customer', JSON.stringify(customer));
      localStorage.setItem('admin_consultant_id', adminId);
    } else {
      clearConsultantMode();
    }
  };

  const clearConsultantMode = () => {
    setSelectedCustomer(null);
    setAdminConsultantId(null);
    setIsConsultantMode(false);

    // Clear from localStorage
    localStorage.removeItem('consultant_mode');
    localStorage.removeItem('consultant_customer');
    localStorage.removeItem('admin_consultant_id');
  };

  const getProjectAttribution = () => {
    if (isConsultantMode && selectedCustomer && adminConsultantId) {
      return {
        createdByAdmin: true,
        adminConsultantId,
        customerName: selectedCustomer.name,
        customerEmail: selectedCustomer.email,
      };
    }
    
    return {
      createdByAdmin: false,
      adminConsultantId: null,
      customerName: null,
      customerEmail: null,
    };
  };

  const value: ConsultantContextType = {
    isConsultantMode,
    selectedCustomer,
    adminConsultantId,
    setConsultantMode,
    clearConsultantMode,
    getProjectAttribution,
  };

  return (
    <ConsultantContext.Provider value={value}>
      {children}
    </ConsultantContext.Provider>
  );
}

export function useConsultant() {
  const context = useContext(ConsultantContext);
  if (context === undefined) {
    throw new Error('useConsultant must be used within a ConsultantProvider');
  }
  return context;
}
