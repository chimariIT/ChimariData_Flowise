import type { APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export type SeedResult = { projectId: string };

/**
 * Create a project for the authenticated user and upload a sample CSV dataset to it.
 * Returns the created projectId that can be used to visit /project/:id, /visualization/:id, /stats/:id.
 */
export async function createTestProjectWithDataset(
  request: APIRequestContext,
  token: string,
  options?: { name?: string; description?: string; csvPath?: string }
): Promise<SeedResult> {
  const name = options?.name ?? `E2E Project ${Date.now()}`;
  const description = options?.description ?? 'Seeded by Playwright for E2E screenshots';

  // 1) Create empty project shell
  const createResp = await request.post('/api/projects', {
    headers: { Authorization: `Bearer ${token}` },
    data: { 
      name, 
      description,
      journeyType: 'ai_guided' // Explicitly set journeyType for test projects
    },
  });
  if (!createResp.ok()) {
    const body = await createResp.text();
    throw new Error(`Failed to create project: ${createResp.status()} ${body}`);
  }
  const createJson = await createResp.json();
  const projectId: string = createJson?.project?.id;
  if (!projectId) throw new Error('Project creation response missing project.id');

  // 2) Upload dataset to the project
  const csvFilePath = options?.csvPath ?? path.resolve(process.cwd(), 'housing_regression_data.csv');
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(csvFilePath);
  } catch (e) {
    // Fallback: minimal CSV content to ensure schema + data exist
    const fallbackCsv = 'category,value\nA,10\nB,20\nC,15\n';
    buffer = Buffer.from(fallbackCsv, 'utf-8');
  }

  const uploadResp = await request.post(`/api/projects/${projectId}/upload`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: {
        name: 'dataset.csv',
        mimeType: 'text/csv',
        buffer,
      },
    },
  });
  if (!uploadResp.ok()) {
    const body = await uploadResp.text();
    throw new Error(`Failed to upload dataset: ${uploadResp.status()} ${body}`);
  }

  return { projectId };
}
