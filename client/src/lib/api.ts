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

    const endpoint = '/api/upload'; // Unified endpoint for all users
    
    // Add authentication headers
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include', // Include session cookies for authentication
    });

    if (!response.ok) {
      const error = await response.json();
      
      if (response.status === 401) {
        // Clear invalid token
        localStorage.removeItem('auth_token');
        throw new Error("Authentication required - Please sign in to upload files");
      }
      
      throw new Error(error.error || `Upload failed: ${response.status}`);
    }

    return await response.json();
  }

  async uploadTrialFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    // Add authentication headers for consistency
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/trial-upload`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
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

  async createGuidedAnalysisPayment(analysisConfig: any, pricing: any): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/create-guided-analysis-payment`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ analysisConfig, pricing }),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      console.log('Guided analysis payment failed:', error);
      throw new Error(error.error || 'Failed to create guided analysis payment');
    }

    return await response.json();
  }

  async executeGuidedAnalysis(analysisId: string, paymentIntentId?: string): Promise<any> {
    const response = await fetch(`${API_BASE}/api/execute-guided-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ analysisId, paymentIntentId }),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to execute guided analysis');
    }

    return await response.json();
  }

  async getGuidedAnalysisResults(analysisId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/api/guided-analysis/${analysisId}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get guided analysis results');
    }

    return await response.json();
  }

  async getProjects(): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/projects`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.status}`);
    }

    return await response.json();
  }

  // Dataset management methods
  async getDatasets(): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/datasets`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch datasets: ${response.status}`);
    }

    return await response.json();
  }

  async getDataset(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/datasets/${id}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dataset: ${response.status}`);
    }

    return await response.json();
  }

  async createDataset(data: {
    name: string;
    description?: string;
    sourceType: string;
    sourceUri?: string;
    schema: any;
    content?: any;
    ingestionMetadata?: any;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/datasets`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create dataset: ${response.status}`);
    }

    return await response.json();
  }

  async deleteDataset(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/datasets/${id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete dataset: ${response.status}`);
    }

    return await response.json();
  }

  async getProject(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch project: ${response.status}`);
    }

    return await response.json();
  }

  async deleteProject(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete project: ${response.status}`);
    }

    return await response.json();
  }

  // Project-Dataset Association methods
  async getProjectDatasets(projectId: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/projects/${projectId}/datasets`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch project datasets: ${response.status}`);
    }

    return await response.json();
  }

  async addDatasetToProject(projectId: string, datasetId: string, role?: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/projects/${projectId}/datasets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ datasetId, role }),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to add dataset to project: ${response.status}`);
    }

    return await response.json();
  }

  async removeDatasetFromProject(projectId: string, datasetId: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/projects/${projectId}/datasets/${datasetId}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to remove dataset from project: ${response.status}`);
    }

    return await response.json();
  }

  // Project Artifact methods
  async getProjectArtifacts(projectId: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/projects/${projectId}/artifacts`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch project artifacts: ${response.status}`);
    }

    return await response.json();
  }

  async createProjectArtifact(projectId: string, data: {
    type: string;
    name: string;
    description?: string;
    content: any;
    parentArtifactId?: string;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/projects/${projectId}/artifacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create project artifact: ${response.status}`);
    }

    return await response.json();
  }

  async getProjectArtifact(projectId: string, artifactId: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/projects/${projectId}/artifacts/${artifactId}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch project artifact: ${response.status}`);
    }

    return await response.json();
  }

  // Multi-source import methods
  async importFromUrl(data: {
    url: string;
    name?: string;
    description?: string;
    format?: string;
    projectId?: string;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/import/url`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to import from URL: ${response.status}`);
    }

    return await response.json();
  }

  async importFromApiEndpoint(data: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    name?: string;
    description?: string;
    projectId?: string;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/import/api`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to import from API: ${response.status}`);
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
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_BASE}/api/auth/user`, {
      method: 'GET',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
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