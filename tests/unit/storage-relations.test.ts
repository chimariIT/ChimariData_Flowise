import { describe, it, expect } from 'vitest';
import { MemStorage } from '../../server/storage';

describe('Storage getters and relationships', () => {
  it('creates user, project, dataset and links them', async () => {
  const storage = new MemStorage();

    // Create a user
    const user = await storage.createUser({
      id: 'user_test',
      email: 'test@example.com',
      hashedPassword: 'hashed',
      firstName: 'T',
      lastName: 'E',
      profileImageUrl: null as any,
      provider: 'email',
      providerId: null as any,
      emailVerified: false,
      emailVerificationToken: null as any,
      emailVerificationExpires: null as any,
      passwordResetToken: null as any,
      passwordResetExpires: null as any,
      subscriptionTier: 'none' as any,
      subscriptionStatus: 'inactive' as any,
      stripeCustomerId: null as any,
      stripeSubscriptionId: null as any,
      subscriptionExpiresAt: null as any,
      isPaid: false as any,
      monthlyUploads: 0,
      monthlyDataVolume: 0,
      monthlyAIInsights: 0,
      monthlyAnalysisComponents: 0,
      monthlyVisualizations: 0,
      currentStorageGb: null as any,
      monthlyDataProcessedGb: null as any,
      usageResetAt: new Date(),
      userRole: 'non-tech' as any,
      technicalLevel: 'beginner' as any,
      industry: null as any,
      preferredJourney: null as any,
      journeyCompletions: null as any,
      onboardingCompleted: false,
    } as any);

    expect(user.id).toBe('user_test');

    // Create a project for the user via MemStorage API (DataProject)
    const project = await storage.createProject({
      userId: user.id,
      name: 'My Project',
      fileName: 'n/a',
      fileSize: 0,
      fileType: 'n/a',
    } as any);

    expect(project).toBeTruthy();
    expect(project.userId).toBe(user.id);

    // Create a dataset
    const dataset = await storage.createDataset({
      ownerId: user.id,
      sourceType: 'upload',
      originalFileName: 'data.csv',
      mimeType: 'text/csv',
      fileSize: 100,
      storageUri: 'memory://data.csv',
    } as any);

    expect(dataset.ownerId).toBe(user.id);

    // Link dataset to project
    const assoc = await storage.addDatasetToProject(project.id, dataset.id, 'primary');
    expect(assoc.projectId).toBe(project.id);
    expect(assoc.datasetId).toBe(dataset.id);

    // Validate getters
    const fetchedUser = await storage.getUser(user.id);
    expect(fetchedUser?.email).toBe('test@example.com');

    const fetchedProject = await storage.getProject(project.id);
    expect(fetchedProject?.name).toBe('My Project');

  const ownerDatasets = await storage.getDatasetsByOwner(user.id);
  expect(ownerDatasets.some((d: any) => d.id === dataset.id)).toBe(true);

    const projectDatasets = await storage.getProjectDatasets(project.id);
    expect(projectDatasets[0].dataset.id).toBe(dataset.id);

    const datasetProjects = await storage.getDatasetProjects(dataset.id);
    expect(datasetProjects[0].project.id).toBe(project.id);
  });

  it('handles multiple associations and removal correctly', async () => {
    const storage = new MemStorage();

    const user = await storage.createUser({ email: 'multi@test.com' } as any);

    const project = await storage.createProject({
      userId: user.id,
      name: 'Multi Project',
      fileName: 'n/a',
      fileSize: 0,
      fileType: 'n/a',
    } as any);

    const d1 = await storage.createDataset({
      ownerId: user.id,
      sourceType: 'upload',
      originalFileName: 'd1.csv',
      mimeType: 'text/csv',
      fileSize: 10,
      storageUri: 'memory://d1.csv',
    } as any);

    const d2 = await storage.createDataset({
      ownerId: user.id,
      sourceType: 'upload',
      originalFileName: 'd2.csv',
      mimeType: 'text/csv',
      fileSize: 20,
      storageUri: 'memory://d2.csv',
    } as any);

    await storage.addDatasetToProject(project.id, d1.id, 'primary');
    await storage.addDatasetToProject(project.id, d2.id, 'join');

    const projDatasetsBefore = await storage.getProjectDatasets(project.id);
    const idsBefore = projDatasetsBefore.map(pd => pd.dataset.id);
    expect(idsBefore).toEqual(expect.arrayContaining([d1.id, d2.id]));
    expect(projDatasetsBefore).toHaveLength(2);

    // Remove one link
    const removed = await storage.removeDatasetFromProject(project.id, d1.id);
    expect(removed).toBe(true);

    const projDatasetsAfter = await storage.getProjectDatasets(project.id);
    expect(projDatasetsAfter).toHaveLength(1);
    expect(projDatasetsAfter[0].dataset.id).toBe(d2.id);

    // Dataset to projects reverse lookup
    const d2Projects = await storage.getDatasetProjects(d2.id);
    expect(d2Projects).toHaveLength(1);
    expect(d2Projects[0].project.id).toBe(project.id);

    // Removing non-existing link returns false
    const removedAgain = await storage.removeDatasetFromProject(project.id, d1.id);
    expect(removedAgain).toBe(false);
  });

  it('returns empty arrays for unknown IDs', async () => {
    const storage = new MemStorage();
    const projDatasets = await storage.getProjectDatasets('non-existent-project');
    const datasetProjects = await storage.getDatasetProjects('non-existent-dataset');
    expect(projDatasets).toEqual([]);
    expect(datasetProjects).toEqual([]);
  });
});
