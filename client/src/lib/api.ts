const API_BASE = window.location.origin;

export class APIClient {
  async uploadFile(file: File, options: {
    name?: string;
    description?: string;
    questions?: string[];
    isTrial?: boolean;
    piiHandled?: boolean;
    anonymizationApplied?: boolean;
    selectedColumns?: string[];
  }): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (options.name) {
      formData.append('name', options.name);
    }
    if (options.description) {
      formData.append('description', options.description);
    }
    if (options.questions) {
      formData.append('questions', JSON.stringify(options.questions));
    }
    if (options.isTrial) {
      formData.append('isTrial', 'true');
    }
    if (options.piiHandled) {
      formData.append('piiHandled', 'true');
    }
    if (options.anonymizationApplied) {
      formData.append('anonymizationApplied', 'true');
    }
    if (options.selectedColumns) {
      formData.append('selectedColumns', JSON.stringify(options.selectedColumns));
    }

    const endpoint = options.isTrial ? '/api/trial-upload' : '/api/projects/upload';
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      body: formData,
      credentials: 'include', // Include session cookies for authentication
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Upload failed: ${response.status}`);
    }

    return await response.json();
  }

  async uploadTrialFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/trial-upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Trial upload failed: ${response.status}`);
    }

    return await response.json();
  }

  async getPricing(): Promise<any> {
    const response = await fetch(`${API_BASE}/api/pricing`);

    if (!response.ok) {
      throw new Error(`Failed to fetch pricing: ${response.status}`);
    }

    return await response.json();
  }

  async calculatePrice(features: string[]): Promise<any> {
    const response = await fetch(`${API_BASE}/api/calculate-price`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ features }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Price calculation failed: ${response.status}`);
    }

    return await response.json();
  }

  async createPaymentIntent(features: string[], projectId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ features, projectId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Payment intent creation failed: ${response.status}`);
    }

    return await response.json();
  }

  async processFeatures(projectId: string, features: string[], paymentIntentId?: string): Promise<any> {
    const response = await fetch(`${API_BASE}/api/process-features`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectId, features, paymentIntentId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Feature processing failed: ${response.status}`);
    }

    return await response.json();
  }

  async getProjects(): Promise<any> {
    const response = await fetch(`${API_BASE}/api/projects`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.status}`);
    }

    return await response.json();
  }

  async getProject(id: string): Promise<any> {
    const response = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch project: ${response.status}`);
    }

    return await response.json();
  }

  async deleteProject(id: string): Promise<any> {
    const response = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete project: ${response.status}`);
    }

    return await response.json();
  }

  // Authentication methods
  async login(credentials: { email: string; password: string }): Promise<any> {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Login failed: ${response.status}`);
    }

    return await response.json();
  }

  async register(userData: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }): Promise<any> {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Registration failed: ${response.status}`);
    }

    return await response.json();
  }

  async logout(): Promise<any> {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Logout failed: ${response.status}`);
    }

    return await response.json();
  }

  async getCurrentUser(): Promise<any> {
    const response = await fetch(`${API_BASE}/api/auth/user`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to get current user: ${response.status}`);
    }

    return await response.json();
  }

  async getOAuthProviders(): Promise<any> {
    const response = await fetch(`${API_BASE}/api/auth/providers`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to get OAuth providers: ${response.status}`);
    }

    return await response.json();
  }
}

export const apiClient = new APIClient();