import { z } from 'zod';
import type { AzureDevOpsClient } from '../azureDevOpsClient.js';

export const workItemTools = {
  query_work_items: {
    description: 'Query work items using WIQL (Work Item Query Language) or simple filters',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      wiql: z.string().optional().describe('WIQL query string (if provided, other filters are ignored)'),
      workItemType: z.string().optional().describe('Filter by type (Bug, Task, User Story, etc.)'),
      state: z.string().optional().describe('Filter by state (Active, Closed, etc.)'),
      assignedTo: z.string().optional().describe('Filter by assigned user (use "@Me" for current user)'),
      areaPath: z.string().optional().describe('Filter by area path'),
      iterationPath: z.string().optional().describe('Filter by iteration path'),
      tags: z.string().optional().describe('Filter by tag'),
      top: z.number().optional().default(50).describe('Max items to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      wiql?: string;
      workItemType?: string;
      state?: string;
      assignedTo?: string;
      areaPath?: string;
      iterationPath?: string;
      tags?: string;
      top?: number;
    }) => {
      const witApi = await client.getWorkItemTrackingApi();
      const project = client.requireProject(args.project);

      let wiql = args.wiql;

      if (!wiql) {
        // Build WIQL from filters
        const conditions: string[] = [`[System.TeamProject] = '${project}'`];

        if (args.workItemType) {
          conditions.push(`[System.WorkItemType] = '${args.workItemType}'`);
        }
        if (args.state) {
          conditions.push(`[System.State] = '${args.state}'`);
        }
        if (args.assignedTo) {
          conditions.push(`[System.AssignedTo] = '${args.assignedTo}'`);
        }
        if (args.areaPath) {
          conditions.push(`[System.AreaPath] UNDER '${args.areaPath}'`);
        }
        if (args.iterationPath) {
          conditions.push(`[System.IterationPath] UNDER '${args.iterationPath}'`);
        }
        if (args.tags) {
          conditions.push(`[System.Tags] CONTAINS '${args.tags}'`);
        }

        wiql = `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo], [System.WorkItemType]
                FROM WorkItems
                WHERE ${conditions.join(' AND ')}
                ORDER BY [System.ChangedDate] DESC`;
      }

      const queryResult = await witApi.queryByWiql({ query: wiql }, { project }, undefined, args.top || 50);

      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        return [];
      }

      // Get work item details
      const ids = queryResult.workItems.map(wi => wi.id!).filter(id => id !== undefined);
      const workItems = await witApi.getWorkItems(
        ids,
        undefined,
        undefined,
        undefined,
        undefined,
        project
      );

      return workItems.map(wi => ({
        id: wi.id,
        rev: wi.rev,
        url: wi.url,
        fields: {
          title: wi.fields?.['System.Title'],
          state: wi.fields?.['System.State'],
          workItemType: wi.fields?.['System.WorkItemType'],
          assignedTo: wi.fields?.['System.AssignedTo']?.displayName,
          createdBy: wi.fields?.['System.CreatedBy']?.displayName,
          createdDate: wi.fields?.['System.CreatedDate'],
          changedDate: wi.fields?.['System.ChangedDate'],
          areaPath: wi.fields?.['System.AreaPath'],
          iterationPath: wi.fields?.['System.IterationPath'],
          tags: wi.fields?.['System.Tags'],
          priority: wi.fields?.['Microsoft.VSTS.Common.Priority'],
          severity: wi.fields?.['Microsoft.VSTS.Common.Severity'],
        },
      }));
    },
  },

  get_work_item: {
    description: 'Get detailed information about a specific work item',
    inputSchema: z.object({
      id: z.number().describe('Work item ID'),
      expand: z.boolean().optional().default(true).describe('Include all fields and relations'),
    }),
    handler: async (client: AzureDevOpsClient, args: { id: number; expand?: boolean }) => {
      const witApi = await client.getWorkItemTrackingApi();

      const workItem = await witApi.getWorkItem(
        args.id,
        undefined,
        undefined,
        args.expand ? 4 : undefined // 4 = All expand options
      );

      return {
        id: workItem.id,
        rev: workItem.rev,
        url: workItem.url,
        fields: workItem.fields,
        relations: workItem.relations?.map(r => ({
          rel: r.rel,
          url: r.url,
          attributes: r.attributes,
        })),
        _links: workItem._links,
      };
    },
  },

  // NOTE: create_work_item and update_work_item removed - this MCP server is READ-ONLY

  list_work_item_types: {
    description: 'List available work item types in a project',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string }) => {
      const witApi = await client.getWorkItemTrackingApi();
      const project = client.requireProject(args.project);

      const types = await witApi.getWorkItemTypes(project);

      return types.map(t => ({
        name: t.name,
        description: t.description,
        referenceName: t.referenceName,
        color: t.color,
        icon: t.icon,
        isDisabled: t.isDisabled,
      }));
    },
  },
};
