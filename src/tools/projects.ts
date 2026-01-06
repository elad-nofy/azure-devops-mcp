import { z } from 'zod';
import type { AzureDevOpsClient } from '../azureDevOpsClient.js';

export const projectTools = {
  test_connection: {
    description: 'Test the connection to Azure DevOps Server and verify authentication',
    inputSchema: z.object({}),
    handler: async (client: AzureDevOpsClient) => {
      const startTime = Date.now();

      try {
        const coreApi = await client.getCoreApi();
        const projects = await coreApi.getProjects();
        const elapsed = Date.now() - startTime;

        return {
          success: true,
          message: 'Connection successful',
          responseTimeMs: elapsed,
          projectCount: projects.length,
          defaultProject: client.getDefaultProject() || '(not set)',
          serverInfo: {
            projectsAccessible: projects.length,
            sampleProjects: projects.slice(0, 3).map(p => p.name),
          },
        };
      } catch (error) {
        const elapsed = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          message: `Connection failed: ${message}`,
          responseTimeMs: elapsed,
          troubleshooting: [
            'Verify AZURE_DEVOPS_URL is correct and accessible',
            'Check if your PAT has not expired',
            'Ensure PAT has required scopes (Code, Build, Work Items, etc.)',
            'Verify network connectivity to the server',
          ],
        };
      }
    },
  },

  list_projects: {
    description: 'List all projects in the Azure DevOps organization/collection',
    inputSchema: z.object({}),
    handler: async (client: AzureDevOpsClient) => {
      const coreApi = await client.getCoreApi();
      const projects = await coreApi.getProjects();

      return projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        state: p.state,
        url: p.url,
        lastUpdateTime: p.lastUpdateTime,
      }));
    },
  },

  get_project: {
    description: 'Get detailed information about a specific project',
    inputSchema: z.object({
      project: z.string().describe('Project name or ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project: string }) => {
      const coreApi = await client.getCoreApi();
      const project = await coreApi.getProject(args.project, true, true);

      return {
        id: project?.id,
        name: project?.name,
        description: project?.description,
        state: project?.state,
        url: project?.url,
        capabilities: project?.capabilities,
        defaultTeam: project?.defaultTeam,
        lastUpdateTime: project?.lastUpdateTime,
      };
    },
  },
};
