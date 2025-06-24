import { apiRequest } from "./queryClient";

const API_BASE = "/api";

export interface AuthResponse {
  token: string;
  user: {
    id: number;
    username: string;
  };
}

export interface Project {
  id: string;
  name: string;
  schema: Record<string, string>;
  questions: string[];
  insights: Record<string, string>;
  createdAt: string;
  recordCount: number;
  status: string;
}

export const auth = {
  login: async (username: string, password: string): Promise<AuthResponse> => {
    const res = await apiRequest("POST", `${API_BASE}/auth/login`, { username, password });
    const data = await res.json();
    localStorage.setItem("token", data.token);
    return data;
  },

  register: async (username: string, password: string): Promise<AuthResponse> => {
    const res = await apiRequest("POST", `${API_BASE}/auth/register`, { username, password });
    const data = await res.json();
    localStorage.setItem("token", data.token);
    return data;
  },

  logout: async (): Promise<void> => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        await apiRequest("POST", `${API_BASE}/auth/logout`);
      } catch (error) {
        console.error("Logout error:", error);
      }
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
  },

  getToken: (): string | null => {
    return localStorage.getItem("token");
  }
};

export const projects = {
  list: async (): Promise<{ projects: Project[] }> => {
    const res = await fetch(`${API_BASE}/projects`, {
      headers: {
        Authorization: `Bearer ${auth.getToken()}`
      }
    });
    if (!res.ok) throw new Error("Failed to fetch projects");
    return res.json();
  },

  get: async (id: string): Promise<Project> => {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      headers: {
        Authorization: `Bearer ${auth.getToken()}`
      }
    });
    if (!res.ok) throw new Error("Failed to fetch project");
    return res.json();
  },

  upload: async (file: File, name: string, questions: string[]): Promise<any> => {
    // Validate inputs
    if (!file) {
      throw new Error("Please select a file to upload");
    }
    if (!name.trim()) {
      throw new Error("Please enter a project name");
    }
    if (questions.length === 0) {
      throw new Error("Please add at least one analysis question");
    }

    // Check file type
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      throw new Error(`Unsupported file type. Please upload a CSV or Excel file (${allowedTypes.join(', ')})`);
    }

    // Check file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      throw new Error("File size must be less than 50MB");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name.trim());
    formData.append("questions", JSON.stringify(questions));

    const res = await fetch(`/api/projects/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.getToken()}`
      },
      body: formData
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = "Upload failed";
      
      try {
        const errorObj = JSON.parse(errorText);
        errorMessage = errorObj.error || errorObj.message || errorMessage;
        
        // Add specific error details if available
        if (errorObj.details) {
          errorMessage += `: ${errorObj.details}`;
        }
      } catch {
        // If not JSON, use status text or raw text
        errorMessage = res.statusText || errorText || `HTTP ${res.status} error`;
      }
      
      throw new Error(errorMessage);
    }

    return res.json();
  }
};
