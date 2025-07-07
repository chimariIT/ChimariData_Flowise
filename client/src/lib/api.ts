const API_BASE = window.location.origin;

export class APIClient {
  async uploadFile(file: File, description?: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (description) {
      formData.append('description', description);
    }

    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
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
    const response = await fetch(`${API_BASE}/api/projects`);

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.status}`);
    }

    return await response.json();
  }

  async getProject(id: string): Promise<any> {
    const response = await fetch(`${API_BASE}/api/projects/${id}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch project: ${response.status}`);
    }

    return await response.json();
  }

  async deleteProject(id: string): Promise<any> {
    const response = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete project: ${response.status}`);
    }

    return await response.json();
  }
}

export const apiClient = new APIClient();