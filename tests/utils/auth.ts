import type { Page, APIRequestContext } from '@playwright/test';

/**
 * Programmatically obtain a valid auth token and inject it into the browser.
 * - Calls POST /api/v1/auth/login on the Python backend (via Vite proxy)
 * - Stores token in localStorage under 'auth_token' (app standard)
 * - Sets Authorization header for subsequent API calls in this context
 */
export async function programmaticLogin(page: Page, request: APIRequestContext) {
  // Wait for server to be ready (health endpoint) with retries
  const waitForHealth = async (maxMs = 60000) => {
    const start = Date.now();
    let lastErr: unknown;
    while (Date.now() - start < maxMs) {
      try {
        const res = await request.get('/health', { timeout: 5000 });
        if (res.ok()) break;
      } catch (e) {
        lastErr = e;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    if (Date.now() - start >= maxMs) {
      throw new Error(`Server health check timed out: ${String(lastErr)}`);
    }
  };

  await waitForHealth().catch(() => {});

  // Login via Python backend auth endpoint
  let resp = await request.post('/api/v1/auth/login', {
    data: { email: 'test@chimaridata.com', password: 'test' },
    timeout: 60000,
  }).catch(() => undefined as any);

  if (!resp || !resp.ok()) {
    // small wait and retry once
    await new Promise(r => setTimeout(r, 1000));
    resp = await request.post('/api/v1/auth/login', {
      data: { email: 'test@chimaridata.com', password: 'test' },
      timeout: 60000,
    });
  }
  if (!resp.ok()) throw new Error(`login failed: ${resp.status()} ${resp.statusText()}`);
  const body = await resp.json();

  // Python backend returns { success, data: { token, user } }
  const token = body?.data?.token || body?.token;
  if (!token) throw new Error('login returned no token');

  // Persist token for app to read
  await page.addInitScript((tk: string) => {
    window.localStorage.setItem('auth_token', tk);
  }, token);

  // Attach auth header for page and request contexts
  await page.setExtraHTTPHeaders({ Authorization: `Bearer ${token}` });

  return token;
}
