const API_BASE = window.location.origin;

export class APIClient {
  async uploadFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

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