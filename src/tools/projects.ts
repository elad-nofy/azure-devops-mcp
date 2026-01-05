import { z } from 'zod';
import type { AzureDevOpsClient } from '../azureDevOpsClient.js';

export const projectTools = {
  list_projects: {
    description: 'List all projects in the Azure DevOps organization/collection',
    inputSchema: z.object({}).optional(),
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
