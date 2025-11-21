import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import authRouter from '../../server/routes/auth';
import adminRouter from '../../server/routes/admin';
import { db } from '../../server/db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { registerCoreTools, MCPToolRegistry } from '../../server/services/mcp-tool-registry';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Admin Tools Management API', () => {
  const nonAdminUser = {
    email: `tools-user-${Date.now()}@example.com`,
    password: 'ToolsUser123!',
    firstName: 'Tools',
    lastName: 'User'
  };

  const adminUser = {
    email: `tools-admin-${Date.now()}@chimaridata.com`,
    password: 'ToolsAdmin123!',
    firstName: 'Tools',
    lastName: 'Admin'
  };

  const newToolName = `integration_tool_${Date.now()}`;
  let nonAdminToken: string;
  let adminToken: string;

  beforeAll(async () => {
    if (MCPToolRegistry.getAllTools().length === 0) {
      registerCoreTools();
    }

    const registerUser = await request(app).post('/api/auth/register').send(nonAdminUser);
    expect(registerUser.status).toBe(200);

    const loginUser = await request(app).post('/api/auth/login').send({
      email: nonAdminUser.email,
      password: nonAdminUser.password
    });
    expect(loginUser.status).toBe(200);
    nonAdminToken = loginUser.body.token;

    const registerAdmin = await request(app).post('/api/auth/register').send(adminUser);
    expect(registerAdmin.status).toBe(200);

    await db
      .update(users)
      .set({ role: 'admin', isAdmin: true })
      .where(eq(users.email, adminUser.email));

    const loginAdmin = await request(app).post('/api/auth/login').send({
      email: adminUser.email,
      password: adminUser.password
    });
    expect(loginAdmin.status).toBe(200);
    adminToken = loginAdmin.body.token;
  });

  afterAll(() => {
    MCPToolRegistry.unregisterTool(newToolName);
  });

  it('rejects non-admin access to the tools catalog', async () => {
    const response = await request(app)
      .get('/api/admin/tools')
      .set(authHeader(nonAdminToken));

    expect(response.status).toBe(403);
    expect(response.body.error || response.body.message).toBeDefined();
  });

  it('returns the tool catalog for admin users', async () => {
    const response = await request(app)
      .get('/api/admin/tools')
      .set(authHeader(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.tools)).toBe(true);
    expect(response.body.totalTools).toBeGreaterThan(0);
  });

  it('fetches details for a specific tool', async () => {
    const response = await request(app)
      .get('/api/admin/tools/statistical_analyzer')
      .set(authHeader(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.tool?.name).toBe('statistical_analyzer');
    expect(response.body.documentation).toBeDefined();
  });

  it('validates tool creation payloads', async () => {
    const response = await request(app)
      .post('/api/admin/tools')
      .set(authHeader(adminToken))
      .send({ name: '' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/missing/i);
  });

  it('registers and retrieves a new tool definition', async () => {
    const createResponse = await request(app)
      .post('/api/admin/tools')
      .set(authHeader(adminToken))
      .send({
        name: newToolName,
        description: 'Integration test tool',
        permissions: ['integration_test'],
        category: 'utility',
        agentAccess: ['data_scientist']
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.success).toBe(true);

    const detailResponse = await request(app)
      .get(`/api/admin/tools/${newToolName}`)
      .set(authHeader(adminToken));

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.success).toBe(true);
    expect(detailResponse.body.tool?.name).toBe(newToolName);
    expect(detailResponse.body.tool?.permissions).toContain('integration_test');
  });
});

