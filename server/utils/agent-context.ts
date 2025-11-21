import type { AgentExecutionContext } from '../types/agent-context';

/**
 * Build agent execution context from user + project data.
 * Extracted to share between routes and tests.
 */
export function buildAgentContext(user: any, project: any): AgentExecutionContext {
  const role = (user?.userRole || 'non-tech') as 'non-tech' | 'business' | 'technical' | 'consultation';
  const projectData = project?.data ?? [];

  return {
    userId: user?.id,
    userEmail: user?.email,
    userRole: role,
    isAdmin: Boolean(user?.isAdmin),
    subscriptionTier: user?.subscriptionTier,
    projectId: project?.id,
    project: {
      id: project?.id,
      userId: project?.userId ?? null,
      name: project?.name ?? null,
      description: project?.description ?? null,
      journeyType: project?.journeyType ?? null,
      status: project?.status ?? null,
      data: project?.data ?? null,
      schema: project?.schema ?? null,
      transformedData: project?.transformedData ?? null,
    },
    data: projectData,
    schema: project?.schema ?? {},
    recordCount: Array.isArray(projectData) ? projectData.length : 0,
    ownershipVerified: true,
    timestamp: new Date(),
    source: 'api',
  };
}
