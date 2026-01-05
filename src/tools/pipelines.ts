import { z } from 'zod';
import type { AzureDevOpsClient } from '../azureDevOpsClient.js';

// Pipeline types from Azure DevOps
enum PipelineRunState {
  Unknown = 0,
  InProgress = 1,
  Canceling = 2,
  Completed = 3,
}

enum PipelineRunResult {
  Unknown = 0,
  Succeeded = 1,
  Failed = 2,
  Canceled = 3,
}

export const pipelineTools = {
  list_pipelines: {
    description: 'List pipeline definitions in a project',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      name: z.string().optional().describe('Filter by name (supports * wildcard)'),
      path: z.string().optional().describe('Filter by folder path'),
      top: z.number().optional().default(50).describe('Max pipelines to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; name?: string; path?: string; top?: number }) => {
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      const definitions = await buildApi.getDefinitions(
        project,
        args.name,
        undefined, // repositoryId
        undefined, // repositoryType
        undefined, // queryOrder
        args.top || 50,
        undefined, // continuationToken
        undefined, // minMetricsTime
        undefined, // definitionIds
        args.path
      );

      return definitions.map(d => ({
        id: d.id,
        name: d.name,
        path: d.path,
        revision: d.revision,
        queueStatus: d.queueStatus,
        url: d._links?.web?.href,
      }));
    },
  },

  get_pipeline_runs: {
    description: 'Get recent runs for a pipeline',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      pipelineId: z.number().describe('Pipeline/definition ID'),
      branch: z.string().optional().describe('Filter by branch'),
      top: z.number().optional().default(25).describe('Max runs to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      pipelineId: number;
      branch?: string;
      top?: number;
    }) => {
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      const runs = await buildApi.getBuilds(
        project,
        [args.pipelineId], // definitions
        undefined, // queues
        undefined, // buildNumber
        undefined, // minTime
        undefined, // maxTime
        undefined, // requestedFor
        undefined, // reasonFilter
        undefined, // statusFilter
        undefined, // resultFilter
        undefined, // tagFilters
        undefined, // properties
        args.top || 25,
        undefined, // continuationToken
        undefined, // maxBuildsPerDefinition
        undefined, // deletedFilter
        undefined, // queryOrder
        args.branch
      );

      return runs.map(r => ({
        id: r.id,
        buildNumber: r.buildNumber,
        state: r.status !== undefined ? PipelineRunState[r.status] : undefined,
        result: r.result !== undefined ? PipelineRunResult[r.result] : undefined,
        sourceBranch: r.sourceBranch,
        sourceVersion: r.sourceVersion,
        triggerInfo: r.triggerInfo,
        requestedBy: r.requestedBy?.displayName,
        requestedFor: r.requestedFor?.displayName,
        queueTime: r.queueTime,
        startTime: r.startTime,
        finishTime: r.finishTime,
        url: r._links?.web?.href,
      }));
    },
  },

  get_pipeline_yaml: {
    description: 'Get the YAML configuration for a pipeline',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      pipelineId: z.number().describe('Pipeline/definition ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; pipelineId: number }) => {
      const buildApi = await client.getBuildApi();
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);

      // Get definition to find YAML file path
      const definition = await buildApi.getDefinition(project, args.pipelineId);

      if (definition.process?.type !== 2) {
        throw new Error('This is not a YAML pipeline');
      }

      const yamlPath = (definition.process as { yamlFilename?: string })?.yamlFilename;
      const repoId = definition.repository?.id;

      if (!yamlPath || !repoId) {
        throw new Error('Cannot find YAML file path or repository');
      }

      // Get YAML content from repo
      const content = await gitApi.getItemContent(
        repoId,
        yamlPath,
        project,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { version: definition.repository?.defaultBranch?.replace('refs/heads/', '') }
      );

      // Convert stream to string
      const chunks: Buffer[] = [];
      for await (const chunk of content) {
        chunks.push(Buffer.from(chunk));
      }
      const yamlContent = Buffer.concat(chunks).toString('utf-8');

      return {
        pipelineId: args.pipelineId,
        pipelineName: definition.name,
        yamlPath,
        repository: definition.repository?.name,
        branch: definition.repository?.defaultBranch,
        content: yamlContent,
      };
    },
  },

  get_pipeline_variables: {
    description: 'Get variables defined for a pipeline',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      pipelineId: z.number().describe('Pipeline/definition ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; pipelineId: number }) => {
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      const definition = await buildApi.getDefinition(project, args.pipelineId);

      const variables: Array<{
        name: string;
        value?: string;
        isSecret: boolean;
        allowOverride: boolean;
      }> = [];

      if (definition.variables) {
        for (const [name, variable] of Object.entries(definition.variables)) {
          variables.push({
            name,
            value: variable.isSecret ? '***' : variable.value,
            isSecret: variable.isSecret || false,
            allowOverride: variable.allowOverride || false,
          });
        }
      }

      return {
        pipelineId: args.pipelineId,
        pipelineName: definition.name,
        variables,
        variableGroups: definition.variableGroups?.map(vg => ({
          id: vg.id,
          name: vg.name,
          description: vg.description,
        })),
      };
    },
  },
};
