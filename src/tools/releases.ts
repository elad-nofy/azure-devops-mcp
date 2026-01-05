import { z } from 'zod';
import type { AzureDevOpsClient } from '../azureDevOpsClient.js';
import { ReleaseStatus, EnvironmentStatus, DeploymentStatus } from 'azure-devops-node-api/interfaces/ReleaseInterfaces.js';

export const releaseTools = {
  list_releases: {
    description: 'List releases with deployment status',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      definitionId: z.number().optional().describe('Filter by release definition ID'),
      statusFilter: z.enum(['active', 'draft', 'abandoned', 'undefined']).optional().describe('Filter by status'),
      environmentStatusFilter: z.number().optional().describe('Filter by environment status'),
      top: z.number().optional().default(25).describe('Max releases to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      definitionId?: number;
      statusFilter?: string;
      environmentStatusFilter?: number;
      top?: number;
    }) => {
      const releaseApi = await client.getReleaseApi();
      const project = client.requireProject(args.project);

      const statusMap: Record<string, ReleaseStatus> = {
        active: ReleaseStatus.Active,
        draft: ReleaseStatus.Draft,
        abandoned: ReleaseStatus.Abandoned,
        undefined: ReleaseStatus.Undefined,
      };

      const releases = await releaseApi.getReleases(
        project,
        args.definitionId,
        undefined, // definitionEnvironmentId
        undefined, // searchText
        undefined, // createdBy
        args.statusFilter ? statusMap[args.statusFilter] : undefined,
        args.environmentStatusFilter,
        undefined, // minCreatedTime
        undefined, // maxCreatedTime
        undefined, // queryOrder
        args.top || 25
      );

      return releases.map(r => ({
        id: r.id,
        name: r.name,
        status: r.status !== undefined ? ReleaseStatus[r.status] : undefined,
        releaseDefinition: {
          id: r.releaseDefinition?.id,
          name: r.releaseDefinition?.name,
        },
        createdOn: r.createdOn,
        createdBy: r.createdBy?.displayName,
        description: r.description,
        environments: r.environments?.map(e => ({
          id: e.id,
          name: e.name,
          status: e.status !== undefined ? EnvironmentStatus[e.status] : undefined,
          deploySteps: e.deploySteps?.map(ds => ({
            status: ds.status !== undefined ? DeploymentStatus[ds.status] : undefined,
            reason: ds.reason,
            lastModifiedOn: ds.lastModifiedOn,
          })),
        })),
      }));
    },
  },

  get_release: {
    description: 'Get detailed information about a specific release',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      releaseId: z.number().describe('Release ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; releaseId: number }) => {
      const releaseApi = await client.getReleaseApi();
      const project = client.requireProject(args.project);

      const release = await releaseApi.getRelease(project, args.releaseId);

      return {
        id: release.id,
        name: release.name,
        status: release.status !== undefined ? ReleaseStatus[release.status] : undefined,
        releaseDefinition: release.releaseDefinition,
        createdOn: release.createdOn,
        createdBy: release.createdBy,
        modifiedOn: release.modifiedOn,
        modifiedBy: release.modifiedBy,
        description: release.description,
        reason: release.reason,
        artifacts: release.artifacts?.map(a => ({
          sourceId: a.sourceId,
          type: a.type,
          alias: a.alias,
          definitionReference: a.definitionReference,
        })),
        environments: release.environments?.map(e => ({
          id: e.id,
          name: e.name,
          status: e.status !== undefined ? EnvironmentStatus[e.status] : undefined,
          rank: e.rank,
          variables: e.variables,
          preDeployApprovals: e.preDeployApprovals,
          postDeployApprovals: e.postDeployApprovals,
          deploySteps: e.deploySteps?.map(ds => ({
            id: ds.id,
            status: ds.status !== undefined ? DeploymentStatus[ds.status] : undefined,
            operationStatus: ds.operationStatus,
            reason: ds.reason,
            hasStarted: ds.hasStarted,
            releaseDeployPhases: ds.releaseDeployPhases?.map(p => ({
            name: p.name,
            status: p.status,
            rank: p.rank,
          })),
          })),
        })),
        variables: release.variables,
      };
    },
  },

  list_release_definitions: {
    description: 'List release/deployment pipeline definitions',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      searchText: z.string().optional().describe('Filter by name'),
      path: z.string().optional().describe('Filter by folder path'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; searchText?: string; path?: string }) => {
      const releaseApi = await client.getReleaseApi();
      const project = client.requireProject(args.project);

      const definitions = await releaseApi.getReleaseDefinitions(
        project,
        args.searchText,
        undefined, // expand
        undefined, // artifactType
        undefined, // artifactSourceId
        undefined, // top
        undefined, // continuationToken
        undefined, // queryOrder
        args.path
      );

      return definitions.map(d => ({
        id: d.id,
        name: d.name,
        path: d.path,
        releaseNameFormat: d.releaseNameFormat,
        description: d.description,
        createdBy: d.createdBy?.displayName,
        createdOn: d.createdOn,
        modifiedBy: d.modifiedBy?.displayName,
        modifiedOn: d.modifiedOn,
        environments: d.environments?.map(e => ({
          id: e.id,
          name: e.name,
          rank: e.rank,
        })),
      }));
    },
  },

  get_release_logs: {
    description: 'Get deployment logs for a release environment',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      releaseId: z.number().describe('Release ID'),
      environmentId: z.number().describe('Environment ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      releaseId: number;
      environmentId: number;
    }) => {
      const releaseApi = await client.getReleaseApi();
      const project = client.requireProject(args.project);

      // Get release to find deploy steps
      const release = await releaseApi.getRelease(project, args.releaseId);
      const environment = release.environments?.find(e => e.id === args.environmentId);

      if (!environment) {
        throw new Error(`Environment ${args.environmentId} not found in release ${args.releaseId}`);
      }

      // Get tasks for the environment
      const tasks = await releaseApi.getTasks(project, args.releaseId, args.environmentId);

      return {
        releaseId: args.releaseId,
        environmentId: args.environmentId,
        environmentName: environment.name,
        status: environment.status !== undefined ? EnvironmentStatus[environment.status] : undefined,
        tasks: tasks.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status,
          dateStarted: t.dateStarted,
          dateEnded: t.dateEnded,
          logUrl: t.logUrl,
          issues: t.issues,
        })),
      };
    },
  },
};
