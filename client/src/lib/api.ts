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
    const res = await apiRequest("POST", `${API_BASE}/login`, { username, password });
    const data = await res.json();
    localStorage.setItem("token", data.token);
    return data;
  },

  register: async (username: string, password: string): Promise<AuthResponse> => {
    const res = await apiRequest("POST", `${API_BASE}/register`, { username, password });
    const data = await res.json();
    localStorage.setItem("token", data.token);
    return data;
  },

  logout: async (): Promise<void> => {
    const token = localStorage.getItem("token");
    if (token) {
      await apiRequest("POST", `${API_BASE}/logout`);
      localStorage.removeItem("token");
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
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    formData.append("questions", JSON.stringify(questions));

    const res = await fetch(`${API_BASE}/projects/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.getToken()}`
      },
      body: formData
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Upload failed");
    }

    return res.json();
  }
};
