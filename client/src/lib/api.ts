// Use Vite proxy in dev (same origin) — the proxy rewrites /api/* to /* for the Python backend.
// Auth headers are preserved by the proxy configuration in vite.config.ts.
export const API_BASE = '';
const RETRYABLE_STATUS_CODES = [429, 502, 503, 504];
const DEFAULT_RETRY_COUNT = 2;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type RequestOptions = {
  parseJson?: boolean;
  retries?: number;
  retryStatuses?: number[];
  backoffMs?: number;
  autoRefresh?: boolean;
  treat404AsNull?: boolean;
  rawResponse?: boolean;
  signal?: AbortSignal;
};

/**
 * Normalize Python backend responses to match frontend expectations.
 * Handles common snake_case → camelCase field mapping on user/project objects.
 * Applied to all JSON responses from the request() method.
 */
function normalizeApiResponse(data: any): any {
  if (!data || typeof data !== 'object') return data;

  // Normalize user objects (top-level or nested)
  const normalizeUser = (u: any) => {
    if (!u || typeof u !== 'object') return u;
    // name → firstName/lastName
    if (u.name && !u.firstName) {
      const parts = u.name.split(' ');
      u.firstName = parts[0] || '';
      u.lastName = parts.slice(1).join(' ') || '';
    }
    // snake_case booleans/fields
    if (u.is_admin !== undefined && u.isAdmin === undefined) u.isAdmin = u.is_admin;
    if (u.is_active !== undefined && u.isActive === undefined) u.isActive = u.is_active;
    // subscription tier variants
    if (u.tier && !u.subscriptionTier) u.subscriptionTier = u.tier;
    if (u.subscription_tier && !u.subscriptionTier) u.subscriptionTier = u.subscription_tier;
    // created/updated timestamps
    if (u.created_at && !u.createdAt) u.createdAt = u.created_at;
    if (u.updated_at && !u.updatedAt) u.updatedAt = u.updated_at;
    return u;
  };

  // Normalize project objects
  const normalizeProject = (p: any) => {
    if (!p || typeof p !== 'object') return p;
    if (p.created_at && !p.createdAt) p.createdAt = p.created_at;
    if (p.updated_at && !p.updatedAt) p.updatedAt = p.updated_at;
    if (p.user_id && !p.userId) p.userId = p.user_id;
    if (p.journey_type && !p.journeyType) p.journeyType = p.journey_type;
    if (p.journey_progress && !p.journeyProgress) p.journeyProgress = p.journey_progress;
    if (p.analysis_results && !p.analysisResults) p.analysisResults = p.analysis_results;
    if (p.is_paid !== undefined && p.isPaid === undefined) p.isPaid = p.is_paid;
    if (p.payment_status && !p.paymentStatus) p.paymentStatus = p.payment_status;
    if (p.record_count !== undefined && p.recordCount === undefined) p.recordCount = p.record_count;
    return p;
  };

  // Normalize dataset objects
  const normalizeDataset = (d: any) => {
    if (!d || typeof d !== 'object') return d;
    if (d.created_at && !d.createdAt) d.createdAt = d.created_at;
    if (d.updated_at && !d.updatedAt) d.updatedAt = d.updated_at;
    if (d.user_id && !d.userId) d.userId = d.user_id;
    if (d.source_type && !d.sourceType) d.sourceType = d.source_type;
    if (d.original_file_name && !d.originalFileName) d.originalFileName = d.original_file_name;
    if (d.record_count !== undefined && d.recordCount === undefined) d.recordCount = d.record_count;
    if (d.ingestion_metadata && !d.ingestionMetadata) d.ingestionMetadata = d.ingestion_metadata;
    if (d.sample_data && !d.sampleData) d.sampleData = d.sample_data;
    return d;
  };

  // Apply normalizations to known response shapes
  if (data.user) normalizeUser(data.user);
  if (data.project) normalizeProject(data.project);
  if (data.dataset) normalizeDataset(data.dataset);

  // Normalize arrays of users/projects/datasets
  if (Array.isArray(data.users)) data.users.forEach(normalizeUser);
  if (Array.isArray(data.projects)) data.projects.forEach(normalizeProject);
  if (Array.isArray(data.datasets)) {
    data.datasets.forEach((item: any) => {
      if (item.dataset) normalizeDataset(item.dataset);
      else normalizeDataset(item);
    });
  }

  // Top-level project response (GET /api/projects/:id)
  if (data.id && data.journey_progress !== undefined) normalizeProject(data);
  if (data.id && data.user_id !== undefined) normalizeProject(data);

  // Normalize success/total for pagination
  if (data.total_count !== undefined && data.totalCount === undefined) data.totalCount = data.total_count;
  if (data.total_pages !== undefined && data.totalPages === undefined) data.totalPages = data.total_pages;

  return data;
}

export class APIClient {
  private refreshPromise: Promise<boolean> | null = null;

  private buildAuthHeaders(base: Record<string, string> = {}) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      base['Authorization'] = `Bearer ${token}`;
      base['X-Forwarded-Authorization'] = `Bearer ${token}`;
    }

    // Add customer context header if in consultant mode
    const consultantMode = localStorage.getItem('consultant_mode');
    const consultantCustomer = localStorage.getItem('consultant_customer');
    if (consultantMode === 'true' && consultantCustomer) {
      try {
        const customer = JSON.parse(consultantCustomer);
        base['X-Customer-Context'] = JSON.stringify({
          userId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email
        });
      } catch (error) {
        console.warn('Failed to parse consultant customer context:', error);
      }
    }

    return base;
  }

  private dispatchAuthEvent(eventName: 'auth-token-stored' | 'auth-token-cleared') {
    try {
      window.dispatchEvent(new Event(eventName));
    } catch (error) {
      console.warn('Failed to dispatch auth event', error);
    }
  }

  private async refreshAuthToken(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      return false;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem('auth_token');
            this.dispatchAuthEvent('auth-token-cleared');
          }
          return false;
        }

        const data = await response.json().catch(() => null);
        if (data?.token) {
          localStorage.setItem('auth_token', data.token);
          this.dispatchAuthEvent('auth-token-stored');
          return true;
        }

        return false;
      } catch (error) {
        console.error('Token refresh failed:', error);
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(url: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const {
      parseJson = true,
      retries = DEFAULT_RETRY_COUNT,
      retryStatuses = RETRYABLE_STATUS_CODES,
      backoffMs = 1000,
      autoRefresh = true,
      treat404AsNull = false,
      rawResponse = false,
      signal
    } = options;

    let attempt = 0;
    let refreshedThisRequest = false;
    let lastError: unknown;

    while (attempt <= retries) {
      // Check if body is FormData - special handling needed
      const isFormData = init.body instanceof FormData;
      const headersInit = init.headers as HeadersInit | undefined;
      const initialHeaders = headersInit ? new Headers(headersInit) : new Headers();

      // Build auth headers (always include Authorization)
      const mergedHeaders = this.buildAuthHeaders(Object.fromEntries(initialHeaders.entries()));

      // Debug: Log headers for upload requests
      if (url.includes('/upload')) {
        console.log('🔍 Building headers for upload:', {
          isFormData,
          hasAuthInMerged: !!mergedHeaders['Authorization'],
          authPreview: mergedHeaders['Authorization']?.substring(0, 30),
          allHeaderKeys: Object.keys(mergedHeaders)
        });
      }

      // For FormData, don't manually set Content-Type - browser sets it automatically with boundary
      // But we still need to include Authorization and other headers
      const finalHeaders = new Headers();
      let hasHeaders = false;
      Object.entries(mergedHeaders).forEach(([key, value]) => {
        // Skip Content-Type for FormData - browser will set it automatically with boundary
        if (isFormData && key.toLowerCase() === 'content-type') {
          return;
        }
        finalHeaders.set(key, value);
        hasHeaders = true;
      });

      const isDevCrossOrigin = import.meta.env.DEV && API_BASE !== window.location.origin;

      // In dev we call the API directly (cross-origin). Keep credentials included so browsers treat
      // the Authorization header as a credentialed request and preserve it during CORS.
      const finalInit: RequestInit = {
        ...init,
        mode: init.mode ?? 'cors',
        credentials: init.credentials ?? 'include',
        signal
      };

      // Always set headers if we have any (Authorization is critical for authenticated requests)
      // For FormData, browser will automatically set Content-Type with boundary even if we set other headers
      if (hasHeaders) {
        finalInit.headers = finalHeaders;
      }

      // Debug: Log request details including Authorization header
      const hasAuth = finalHeaders.has('Authorization');
      const authPreview = hasAuth ? finalHeaders.get('Authorization')?.substring(0, 20) + '...' : 'none';
      console.log(`🌐 [REQUEST] ${finalInit.method || 'GET'} ${url} - Auth: ${authPreview}`);

      try {
        const response = await fetch(`${API_BASE}${url}`, finalInit);

        if (response.status === 401 && autoRefresh && !refreshedThisRequest && localStorage.getItem('auth_token')) {
          const refreshed = await this.refreshAuthToken();
          if (refreshed) {
            refreshedThisRequest = true;
            attempt++;
            continue;
          }
        }

        if (retryStatuses.includes(response.status) && attempt < retries) {
          await sleep(backoffMs * (attempt + 1));
          attempt++;
          continue;
        }

        if (response.status === 401 && autoRefresh) {
          console.error('🔐 [AUTH] 401 response - REMOVING TOKEN from localStorage');
          console.error('🔐 [AUTH] Request was:', finalInit.method || 'GET', url);
          localStorage.removeItem('auth_token');
          this.dispatchAuthEvent('auth-token-cleared');
          console.error('🔐 [AUTH] Token cleared event dispatched');
        }

        if (response.status === 404 && treat404AsNull) {
          return null as T;
        }

        if (!response.ok) {
          let errorMessage = `Request to ${url} failed with status ${response.status}`;
          let errorBody: any = null;
          try {
            errorBody = await response.json();
            errorMessage = errorBody.error || errorBody.message || errorMessage;
          } catch {
            // ignore parse errors
          }
          const error: any = new Error(errorMessage);
          error.status = response.status;
          if (errorBody) {
            error.details = errorBody;
          }
          throw error;
        }

        if (rawResponse) {
          return response as unknown as T;
        }

        if (!parseJson) {
          return undefined as T;
        }

        if (response.status === 204) {
          return undefined as T;
        }

        const contentType = response.headers.get('Content-Type') || '';
        if (!contentType.includes('application/json')) {
          return undefined as T;
        }

        const json = await response.json();
        return normalizeApiResponse(json) as T;
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          throw error;
        }

        const shouldRetryNetworkError = error instanceof TypeError;
        const status = (error as any)?.status;

        if ((shouldRetryNetworkError || (typeof status === 'number' && retryStatuses.includes(status))) && attempt < retries) {
          await sleep(backoffMs * (attempt + 1));
          attempt++;
          lastError = error;
          continue;
        }

        lastError = error;
        break;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`Request to ${url} failed after ${retries + 1} attempts`);
  }

  private async requestBlob(url: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<Blob> {
    const response = await this.request<Response>(url, init, { ...options, parseJson: false, rawResponse: true });
    return response.blob();
  }

  async post<T = any>(url: string, body?: any, options: { headers?: Record<string, string>; retries?: number; signal?: AbortSignal } = {}): Promise<T> {
    const isFormData = body instanceof FormData;
    const headers = isFormData
      ? options.headers || {}
      : { 'Content-Type': 'application/json', ...(options.headers || {}) };

    return this.request<T>(url, {
      method: 'POST',
      headers,
      body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined
    }, { retries: options.retries, signal: options.signal });
  }

  async put<T = any>(url: string, body?: any, options: { headers?: Record<string, string>; retries?: number } = {}): Promise<T> {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    return this.request<T>(url, {
      method: 'PUT',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    }, { retries: options.retries });
  }

  async delete<T = any>(url: string, options: { headers?: Record<string, string>; retries?: number } = {}): Promise<T> {
    return this.request<T>(url, {
      method: 'DELETE',
      headers: options.headers
    }, { retries: options.retries, treat404AsNull: true });
  }
  async uploadFile(file: File, options: {
    name?: string;
    description?: string;
    questions?: string[];
    isTrial?: boolean;
    piiHandled?: boolean;
    anonymizationApplied?: boolean;
    selectedColumns?: string[];
    journeyType?: string;
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
    if (options.journeyType) {
      formData.append('journeyType', options.journeyType);
    }

    const endpoint = '/api/projects/upload'; // Correct endpoint path

    // Debug: Check if token exists before making request
    const token = localStorage.getItem('auth_token');
    console.log('🔍 Upload request - token exists:', !!token, 'token preview:', token?.substring(0, 20));

    try {
      return await this.request(endpoint, {
        method: 'POST',
        headers: {},
        body: formData
      }, { retries: 3 });
    } catch (error: any) {
      if (error?.status === 401) {
        throw new Error('Authentication required - Please sign in to upload files');
      }
      throw error;
    }
  }

  async exportProject(projectId: string, format: string): Promise<Blob> {
    const url = `/api/projects/${projectId}/export?format=${encodeURIComponent(format)}`;
    const blob = await this.requestBlob(url, {
      method: 'GET'
    });
    return blob;
  }

  async runAudienceAnalysis(projectId: string, payload: {
    analysisType: string;
    config?: Record<string, unknown>;
    audienceContext?: Record<string, unknown>;
  }): Promise<any> {
    return this.post(`/api/analyze-data/${projectId}`, payload);
  }

  async getAudienceAnalysisResults(projectId: string, audienceType?: string): Promise<any> {
    const query = audienceType ? `?audienceType=${encodeURIComponent(audienceType)}` : '';
    return this.request(`/api/analyze-data/${projectId}/results${query}`, {
      method: 'GET'
    });
  }

  async getAudienceAnalysisTypes(projectId: string): Promise<any> {
    return this.request(`/api/analyze-data/${projectId}/types`, {
      method: 'GET'
    });
  }

  async createProjectVisualization(projectId: string, payload: Record<string, unknown>): Promise<any> {
    return this.post(`/api/create-visualization/${projectId}`, payload);
  }

  async getProjectArtifacts(projectId: string): Promise<any> {
    return this.request(`/api/projects/${projectId}/artifacts`, {
      method: 'GET'
    });
  }

  async getProjectDatasets(projectId: string): Promise<any> {
    return this.request(`/api/projects/${projectId}/datasets`, {
      method: 'GET'
    });
  }

  /**
   * Submit feedback for a checkpoint
   */
  async submitCheckpointFeedback(
    projectId: string,
    checkpointId: string,
    feedback: string,
    approved: boolean
  ): Promise<any> {
    return this.post(`/api/projects/${projectId}/checkpoints/${checkpointId}/feedback`, {
      feedback,
      approved
    });
  }

  /**
   * Upload a file to a project
   */
  async uploadFileToProject(projectId: string, file: File, options?: { onProgress?: (percent: number) => void }): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    return this.request(`/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: formData
    });
  }

  /**
   * Ingest data from non-file sources (databases, APIs, cloud, scraping, streaming)
   */
  async ingestDataSource(params: {
    sourceType: string;
    projectId: string;
    config: Record<string, any>;
    label?: string;
  }): Promise<any> {
    return this.post('/api/data-ingestion/ingest', params);
  }

  /**
   * Update project progress/journey state
   */
  async updateProjectProgress(projectId: string, progress: Record<string, any>): Promise<any> {
    return this.put(`/api/projects/${projectId}/progress`, progress);
  }

  async detectTimeSeriesColumns(projectId: string): Promise<any> {
    return this.request(`/api/projects/${projectId}/time-series/detect`, {
      method: 'GET'
    });
  }

  async runTimeSeriesAnalysis(projectId: string, config: Record<string, unknown>): Promise<any> {
    return this.post(`/api/projects/${projectId}/time-series`, config);
  }

  async runStepByStepAnalysis(projectId: string, config: Record<string, unknown>): Promise<any> {
    return this.post('/api/step-by-step-analysis', {
      projectId,
      config
    });
  }

  async getEnhancedCapabilities(): Promise<any> {
    const headers: any = this.buildAuthHeaders();
    const response = await fetch(`${API_BASE}/api/enhanced-analysis/capabilities`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch enhanced capabilities: ${response.status}`);
    }
    return await response.json();
  }

  async uploadTrialFile(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      return await this.request('/api/projects/trial-upload', {
        method: 'POST',
        headers: {},
        body: formData
      }, { retries: 3 });
    } catch (error: any) {
      throw new Error(error?.message || 'Trial upload failed');
    }
  }

  async getPricing(): Promise<any> {
    return this.request('/api/pricing', {
      method: 'GET'
    });
  }

  async calculatePrice(features: string[]): Promise<any> {
    return this.request('/api/calculate-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features })
    });
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
    return this.request('/api/projects', {
      method: 'GET'
    });
  }

  async getJourneyState(projectId: string): Promise<any> {
    const response = await this.request<{ journeyState?: any }>(
      `/api/projects/${projectId}/journey-state`,
      { method: 'GET' }
    );

    return response?.journeyState ?? null;
  }

  // DU-1 FIX: Get join metadata WITHOUT actual data
  async getJoinMetadata(projectId: string): Promise<any> {
    const response = await this.request<{ metadata?: any }>(
      `/api/projects/${projectId}/join-metadata`,
      { method: 'GET' }
    );

    return response?.metadata ?? null;
  }

  // DU-1 FIX: Get individual datasets - returns array of dataset objects with previews
  async getIndividualDatasets(projectId: string): Promise<any> {
    const response = await this.request<{ individualDatasets?: any }>(
      `/api/projects/${projectId}/individual-datasets`,
      { method: 'GET' }
    );

    return response?.individualDatasets ?? null;
  }

  // Create a new project
  async createProject(data: { name: string; description?: string; journeyType?: string }): Promise<any> {
    return this.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  // Dataset management methods
  async getDatasets(): Promise<any> {
    return this.request('/api/datasets', { method: 'GET' });
  }

  async getDataset(id: string): Promise<any> {
    return this.request(`/api/datasets/${id}`, { method: 'GET' });
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
    return this.request('/api/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  async deleteDataset(id: string): Promise<any> {
    return this.request(`/api/datasets/${id}`, {
      method: 'DELETE'
    });
  }

  async getProject(id: string): Promise<any> {
    return this.request(`/api/projects/${id}`, { method: 'GET' });
  }

  async getAnalysisResults(projectId: string): Promise<any> {
    return this.get(`/api/analysis-execution/results/${projectId}`);
  }


  async deleteProject(id: string): Promise<any> {
    return this.request(`/api/projects/${id}`, { method: 'DELETE' });
  }

  async updateProjectSchema(projectId: string, schema: Record<string, any>): Promise<any> {
    return this.put(`/api/projects/${projectId}/schema`, { schema });
  }

  // Project-Dataset Association methods
  // Note: getProjectDatasets already defined earlier in the class (line 393)

  async addDatasetToProject(projectId: string, datasetId: string, role?: string): Promise<any> {
    return this.request(`/api/projects/${projectId}/datasets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetId, role })
    });
  }

  async removeDatasetFromProject(projectId: string, datasetId: string): Promise<any> {
    return this.request(`/api/projects/${projectId}/datasets/${datasetId}`, {
      method: 'DELETE'
    });
  }

  // Project session helpers
  async getProjectSession(journeyType: string): Promise<any> {
    const query = encodeURIComponent(journeyType);
    return this.get(`/api/project-session/current?journeyType=${query}`);
  }

  async updateProjectSessionStep(sessionId: string, step: string, data: any): Promise<any> {
    return this.post(`/api/project-session/${sessionId}/update-step`, { step, data });
  }

  async validateProjectSession(sessionId: string, executionResults: any): Promise<any> {
    return this.post(`/api/project-session/${sessionId}/validate-execution`, { executionResults });
  }

  async linkProjectSession(sessionId: string, projectId: string): Promise<any> {
    return this.post(`/api/project-session/${sessionId}/link-project`, { projectId });
  }

  async clearProjectSession(sessionId: string): Promise<any> {
    return this.delete(`/api/project-session/${sessionId}`);
  }

  // Project Artifact methods
  // Note: getProjectArtifacts already defined earlier in the class (line 387)

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

  // Dynamic template generation for a project
  async generateDynamicTemplate(input: {
    projectId: string;
    industry: string;
    businessContext: string;
    analysisGoals?: string[];
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/api/template/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      credentials: 'include',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to generate template: ${response.status}`);
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

  // Authentication methods with timeout optimization
  async login(credentials: { email: string; password: string }): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `Login failed: ${response.status}`;
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (parseError) {
          // If response is not JSON, use the status text or default message
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      try {
        const result = normalizeApiResponse(await response.json());

        // Automatically persist authentication token for any consumer of apiClient.login
        if (result?.token) {
          console.log('🔐 [LOGIN] Token received, length:', result.token.length);
          console.log('🔐 [LOGIN] localStorage available:', typeof localStorage !== 'undefined');
          console.log('🔐 [LOGIN] localStorage length before:', localStorage.length);

          try {
            localStorage.setItem('auth_token', result.token);
            console.log('🔐 [LOGIN] setItem completed without exception');
          } catch (storageError) {
            console.error('🔐 [LOGIN] localStorage.setItem FAILED:', storageError);
          }

          // Immediate verification
          const stored = localStorage.getItem('auth_token');
          console.log('🔐 [LOGIN] Immediate check - Token stored:', !!stored, 'Length matches:', stored?.length === result.token.length);
          console.log('🔐 [LOGIN] localStorage length after:', localStorage.length);

          // Delayed verification to check for async clearing
          setTimeout(() => {
            const delayed = localStorage.getItem('auth_token');
            console.log('🔐 [LOGIN] Delayed check (100ms) - Token still exists:', !!delayed);
          }, 100);

          this.dispatchAuthEvent('auth-token-stored');
          console.log('🔐 [LOGIN] Event dispatched: auth-token-stored');
        }

        return result;
      } catch (parseError) {
        throw new Error('Invalid response format from server');
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        throw new Error('Login timeout - please check your connection and try again');
      }
      throw error;
    }
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
      body: JSON.stringify({
        ...userData,
        // Send both formats so Python backend (snake_case) and Node.js (camelCase) both work
        first_name: userData.firstName,
        last_name: userData.lastName,
      }),
      credentials: 'include',
    });

    if (!response.ok) {
      let errorMessage = `Registration failed: ${response.status}`;
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch (parseError) {
        // If response is not JSON, use the status text or default message
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    try {
      const result = normalizeApiResponse(await response.json());

      if ((result as any)?.token) {
        localStorage.setItem('auth_token', (result as any).token);
        this.dispatchAuthEvent('auth-token-stored');
      }

      return result;
    } catch (parseError) {
      throw new Error('Invalid response format from server');
    }
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
    if (!token) {
      // Return null instead of throwing to allow graceful fallback
      return null;
    }

    try {
      const data = await this.request<{ success: boolean; user: any }>(
        '/api/auth/user',
        { method: 'GET' }
      );

      return data.success ? data.user : data;
    } catch (error) {
      // If token is invalid/expired, clear it and return null
      console.warn('Failed to get current user, token may be expired:', error);
      localStorage.removeItem('auth_token');
      this.dispatchAuthEvent('auth-token-cleared');
      return null;
    }
  }

  async get(endpoint: string, options: { headers?: Record<string, string>; retries?: number; treat404AsNull?: boolean } = {}): Promise<any> {
    return this.request(endpoint, {
      method: 'GET',
      headers: options.headers
    }, {
      retries: options.retries,
      treat404AsNull: options.treat404AsNull
    });
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

  // Streaming Sources API methods
  async createStreamingSource(config: {
    name: string;
    description?: string;
    datasetId: string;
    protocol: 'websocket' | 'sse' | 'poll';
    endpoint: string;
    headers?: Record<string, string>;
    parseSpec?: {
      format?: 'json' | 'text';
      jsonPath?: string;
      delimiter?: string;
      timestampPath?: string;
      dedupeKeyPath?: string;
    };
    batchSize?: number;
    flushMs?: number;
    maxBuffer?: number;
    pollInterval?: number;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/streaming-sources`, {
      method: 'POST',
      headers,
      body: JSON.stringify(config),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create streaming source: ${response.status}`);
    }

    return await response.json();
  }

  async getStreamingSources(filters?: {
    projectId?: string;
    datasetId?: string;
    status?: string;
    protocol?: string;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.datasetId) params.set('datasetId', filters.datasetId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.protocol) params.set('protocol', filters.protocol);

    const response = await fetch(`${API_BASE}/api/streaming-sources?${params}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch streaming sources: ${response.status}`);
    }

    return await response.json();
  }

  async getStreamingSource(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/streaming-sources/${id}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch streaming source: ${response.status}`);
    }

    return await response.json();
  }

  async updateStreamingSource(id: string, updates: {
    name?: string;
    description?: string;
    endpoint?: string;
    headers?: Record<string, string>;
    parseSpec?: any;
    batchSize?: number;
    flushMs?: number;
    maxBuffer?: number;
    pollInterval?: number;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/streaming-sources/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update streaming source: ${response.status}`);
    }

    return await response.json();
  }

  async startStreamingSource(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/streaming-sources/${id}/start`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to start streaming source: ${response.status}`);
    }

    return await response.json();
  }

  async stopStreamingSource(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/streaming-sources/${id}/stop`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to stop streaming source: ${response.status}`);
    }

    return await response.json();
  }

  async deleteStreamingSource(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/streaming-sources/${id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete streaming source: ${response.status}`);
    }

    return await response.json();
  }

  // Scraping Jobs API methods
  async createScrapingJob(config: {
    name: string;
    description?: string;
    datasetId: string;
    strategy: 'http' | 'puppeteer';
    targetUrl: string;
    schedule?: string;
    extractionSpec: {
      selectors?: Record<string, string>;
      jsonPath?: string;
      tableSelector?: string;
      followPagination?: {
        enabled: boolean;
        nextSelector?: string;
        maxPages?: number;
        waitTime?: number;
      };
    };
    loginSpec?: {
      type: 'form' | 'basic' | 'header';
      usernameSelector?: string;
      passwordSelector?: string;
      username?: string;
      password?: string;
      headers?: Record<string, string>;
    };
    rateLimitRPM?: number;
    maxConcurrency?: number;
    respectRobots?: boolean;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/scraping-jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(config),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create scraping job: ${response.status}`);
    }

    return await response.json();
  }

  async getScrapingJobs(filters?: {
    projectId?: string;
    datasetId?: string;
    status?: string;
    strategy?: string;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.datasetId) params.set('datasetId', filters.datasetId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.strategy) params.set('strategy', filters.strategy);

    const response = await fetch(`${API_BASE}/api/scraping-jobs?${params}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch scraping jobs: ${response.status}`);
    }

    return await response.json();
  }

  async getScrapingJob(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/scraping-jobs/${id}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch scraping job: ${response.status}`);
    }

    return await response.json();
  }

  async updateScrapingJob(id: string, updates: {
    name?: string;
    description?: string;
    targetUrl?: string;
    schedule?: string;
    extractionSpec?: any;
    loginSpec?: any;
    rateLimitRPM?: number;
    maxConcurrency?: number;
    respectRobots?: boolean;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/scraping-jobs/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update scraping job: ${response.status}`);
    }

    return await response.json();
  }

  async startScrapingJob(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/scraping-jobs/${id}/start`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to start scraping job: ${response.status}`);
    }

    return await response.json();
  }

  async stopScrapingJob(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/scraping-jobs/${id}/stop`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to stop scraping job: ${response.status}`);
    }

    return await response.json();
  }

  async runScrapingJobOnce(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/scraping-jobs/${id}/run`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to run scraping job: ${response.status}`);
    }

    return await response.json();
  }

  async deleteScrapingJob(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/scraping-jobs/${id}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete scraping job: ${response.status}`);
    }

    return await response.json();
  }

  async getScrapingJobRuns(id: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/scraping-jobs/${id}/runs`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch scraping job runs: ${response.status}`);
    }

    return await response.json();
  }

  // Live Sources Overview API method
  async getLiveSourcesOverview(projectId?: string): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);

    const response = await fetch(`${API_BASE}/api/live-sources/overview?${params}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch live sources overview: ${response.status}`);
    }

    return await response.json();
  }

  // Test connection methods
  async testStreamingConnection(config: {
    protocol: 'websocket' | 'sse' | 'poll';
    endpoint: string;
    headers?: Record<string, string>;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/streaming-sources/test-connection`, {
      method: 'POST',
      headers,
      body: JSON.stringify(config),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Connection test failed: ${response.status}`);
    }

    return await response.json();
  }

  async testScrapingExtraction(config: {
    strategy: 'http' | 'puppeteer';
    targetUrl: string;
    extractionSpec: any;
  }): Promise<any> {
    const token = localStorage.getItem('auth_token');
    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/api/scraping-jobs/test-extraction`, {
      method: 'POST',
      headers,
      body: JSON.stringify(config),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Extraction test failed: ${response.status}`);
    }

    return await response.json();
  }

  // Template API methods (Task 2.2: Frontend Template Integration)
  async getTemplates(filters?: {
    journeyType?: string;
    industry?: string;
    persona?: string;
    isSystem?: boolean;
    search?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.journeyType) params.append('journeyType', filters.journeyType);
    if (filters?.industry) params.append('industry', filters.industry);
    if (filters?.persona) params.append('persona', filters.persona);
    if (filters?.isSystem !== undefined) params.append('isSystem', String(filters.isSystem));
    if (filters?.search) params.append('search', filters.search);

    const url = `/api/templates${params.toString() ? `?${params.toString()}` : ''}`;
    return this.get(url);
  }

  async getTemplateById(id: string): Promise<any> {
    return this.get(`/api/templates/${id}`);
  }

  async getTemplatesByIndustry(industry: string): Promise<any> {
    return this.get(`/api/templates/industry/${industry}`);
  }

  async getTemplatesByJourneyType(journeyType: string): Promise<any> {
    return this.get(`/api/templates/journey/${journeyType}`);
  }

  async searchTemplates(query: string): Promise<any> {
    return this.get(`/api/templates/search?q=${encodeURIComponent(query)}`);
  }

  async getTemplateCatalog(): Promise<any> {
    return this.get('/api/templates/catalog');
  }

  // Data Quality Methods
  async analyzeDataQuality(datasetId: string): Promise<any> {
    return this.post('/api/data-quality/analyze', { datasetId });
  }

  async autoFixDataQuality(datasetId: string, issueIds: string[]): Promise<any> {
    return this.post('/api/data-quality/auto-fix', { datasetId, issueIds });
  }

  // Scenario Analysis
  async getScenarioParameters(analysisType: string): Promise<any> {
    return this.get(`/api/v1/analysis-execution/scenario-params/${analysisType}`);
  }

  async runScenario(params: {
    projectId: string;
    analysisType: string;
    parameters: Record<string, any>;
    originalExecutionId?: string;
  }): Promise<any> {
    return this.post('/api/v1/analysis-execution/scenario-run', {
      project_id: params.projectId,
      analysis_type: params.analysisType,
      parameters: params.parameters,
      original_execution_id: params.originalExecutionId,
    });
  }
}

export const apiClient = new APIClient();