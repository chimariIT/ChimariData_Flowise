/**
 * Centralized API functions for all backend communications
 */

const API_BASE = '';

interface APIResponse<T = any> {
  success?: boolean;
  requiresPIIDecision?: boolean;
  piiResult?: any;
  tempFileId?: string;
  data?: T;
  error?: string;
  message?: string;
}

export class APIClient {
  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async uploadFile(file: File, options: {
    name?: string;
    questions?: string[];
    isTrial?: boolean;
    piiHandled?: boolean;
    anonymizationApplied?: boolean;
    selectedColumns?: string[];
  } = {}): Promise<APIResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', options.name || file.name.split('.')[0]);
    formData.append('questions', JSON.stringify(options.questions || []));
    
    if (options.piiHandled !== undefined) {
      formData.append('piiHandled', options.piiHandled.toString());
    }
    if (options.anonymizationApplied !== undefined) {
      formData.append('anonymizationApplied', options.anonymizationApplied.toString());
    }
    if (options.selectedColumns) {
      formData.append('selectedColumns', JSON.stringify(options.selectedColumns));
    }

    const endpoint = options.isTrial ? '/api/upload-trial' : '/api/projects/upload';
    const headers = options.isTrial ? {} : this.getAuthHeaders();

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async register(userData: { username: string; email: string; password: string }): Promise<APIResponse> {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.token) {
      localStorage.setItem('auth_token', result.token);
    }
    return result;
  }

  async login(credentials: { username: string; password: string }): Promise<APIResponse> {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.token) {
      localStorage.setItem('auth_token', result.token);
    }
    return result;
  }

  async getProjects(): Promise<APIResponse> {
    const response = await fetch(`${API_BASE}/api/projects`, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.status}`);
    }

    return await response.json();
  }

  async getUser(): Promise<APIResponse> {
    const response = await fetch(`${API_BASE}/api/auth/user`, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.status}`);
    }

    return await response.json();
  }
}

export const apiClient = new APIClient();