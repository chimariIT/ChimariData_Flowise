import type { Page, APIRequestContext } from '@playwright/test';

/**
 * Programmatically obtain a valid auth token and inject it into the browser.
 * - Calls POST /api/auth/login-test (server creates or returns a test user and token)
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
        const res = await request.get('/api/health', { timeout: 5000 });
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

  // Attempt login with a longer timeout and a brief retry on flake
  let resp = await request.post('/api/auth/login-test', { timeout: 60000 }).catch(() => undefined as any);
  if (!resp || !resp.ok()) {
    // small wait and retry once
    await new Promise(r => setTimeout(r, 1000));
    resp = await request.post('/api/auth/login-test', { timeout: 60000 });
  }
  if (!resp.ok()) throw new Error(`login-test failed: ${resp.status()} ${resp.statusText()}`);
  const data = await resp.json();
  if (!data?.token) throw new Error('login-test returned no token');

  const token = data.token as string;

  // Persist token for app to read
  await page.addInitScript((tk: string) => {
    window.localStorage.setItem('auth_token', tk);
  }, token);

  // Attach auth header for page and request contexts
  await page.setExtraHTTPHeaders({ Authorization: `Bearer ${token}` });
  // Some Playwright versions allow setting extra headers on request via new context;
  // for this shared request context, rely on explicit headers in calls that seed data.

  return token;
}
