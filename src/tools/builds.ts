import { z } from 'zod';
import type { AzureDevOpsClient } from '../azureDevOpsClient.js';
import { BuildStatus, BuildResult, BuildQueryOrder } from 'azure-devops-node-api/interfaces/BuildInterfaces.js';

export const buildTools = {
  list_builds: {
    description: 'List recent builds with status and results',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      definitions: z.array(z.number()).optional().describe('Filter by build definition IDs'),
      branchName: z.string().optional().describe('Filter by branch (e.g., "refs/heads/main")'),
      statusFilter: z.enum(['all', 'inProgress', 'completed', 'cancelling', 'postponed', 'notStarted', 'none']).optional().describe('Filter by status'),
      resultFilter: z.enum(['succeeded', 'partiallySucceeded', 'failed', 'canceled', 'none']).optional().describe('Filter by result'),
      requestedFor: z.string().optional().describe('Filter by user who requested the build'),
      top: z.number().optional().default(25).describe('Max builds to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      definitions?: number[];
      branchName?: string;
      statusFilter?: string;
      resultFilter?: string;
      requestedFor?: string;
      top?: number;
    }) => {
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      const statusMap: Record<string, BuildStatus> = {
        all: BuildStatus.All,
        inProgress: BuildStatus.InProgress,
        completed: BuildStatus.Completed,
        cancelling: BuildStatus.Cancelling,
        postponed: BuildStatus.Postponed,
        notStarted: BuildStatus.NotStarted,
        none: BuildStatus.None,
      };

      const resultMap: Record<string, BuildResult> = {
        succeeded: BuildResult.Succeeded,
        partiallySucceeded: BuildResult.PartiallySucceeded,
        failed: BuildResult.Failed,
        canceled: BuildResult.Canceled,
        none: BuildResult.None,
      };

      const builds = await buildApi.getBuilds(
        project,
        args.definitions,
        undefined, // queues
        undefined, // buildNumber
        undefined, // minTime
        undefined, // maxTime
        args.requestedFor,
        undefined, // reasonFilter
        args.statusFilter ? statusMap[args.statusFilter] : undefined,
        args.resultFilter ? resultMap[args.resultFilter] : undefined,
        undefined, // tagFilters
        undefined, // properties
        args.top || 25,
        undefined, // continuationToken
        undefined, // maxBuildsPerDefinition
        undefined, // deletedFilter
        BuildQueryOrder.FinishTimeDescending,
        args.branchName
      );

      return builds.map(b => ({
        id: b.id,
        buildNumber: b.buildNumber,
        status: BuildStatus[b.status as number],
        result: b.result !== undefined ? BuildResult[b.result] : undefined,
        definition: {
          id: b.definition?.id,
          name: b.definition?.name,
        },
        sourceBranch: b.sourceBranch,
        sourceVersion: b.sourceVersion,
        requestedBy: b.requestedBy?.displayName,
        requestedFor: b.requestedFor?.displayName,
        queueTime: b.queueTime,
        startTime: b.startTime,
        finishTime: b.finishTime,
        url: b._links?.web?.href,
      }));
    },
  },

  get_build: {
    description: 'Get detailed information about a specific build',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      buildId: z.number().describe('Build ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; buildId: number }) => {
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      const build = await buildApi.getBuild(project, args.buildId);

      return {
        id: build.id,
        buildNumber: build.buildNumber,
        status: build.status !== undefined ? BuildStatus[build.status] : undefined,
        result: build.result !== undefined ? BuildResult[build.result] : undefined,
        definition: build.definition,
        sourceBranch: build.sourceBranch,
        sourceVersion: build.sourceVersion,
        requestedBy: build.requestedBy,
        requestedFor: build.requestedFor,
        queueTime: build.queueTime,
        startTime: build.startTime,
        finishTime: build.finishTime,
        repository: build.repository,
        triggerInfo: build.triggerInfo,
        logs: build.logs,
        url: build._links?.web?.href,
      };
    },
  },

  get_build_logs: {
    description: 'Get build logs - useful for analyzing build errors and failures',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      buildId: z.number().describe('Build ID'),
      logId: z.number().optional().describe('Specific log ID (omit to get log list first)'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; buildId: number; logId?: number }) => {
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      if (args.logId !== undefined) {
        // Get specific log content
        const logLines = await buildApi.getBuildLogLines(project, args.buildId, args.logId);
        return {
          logId: args.logId,
          content: logLines.join('\n'),
        };
      } else {
        // Get list of all logs
        const logs = await buildApi.getBuildLogs(project, args.buildId);
        return logs.map(log => ({
          id: log.id,
          type: log.type,
          url: log.url,
          lineCount: log.lineCount,
        }));
      }
    },
  },

  list_build_definitions: {
    description: 'List build/pipeline definitions',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      name: z.string().optional().describe('Filter by definition name (supports wildcards *)'),
      path: z.string().optional().describe('Filter by folder path'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; name?: string; path?: string }) => {
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      const definitions = await buildApi.getDefinitions(
        project,
        args.name,
        undefined, // repositoryId
        undefined, // repositoryType
        undefined, // queryOrder
        undefined, // top
        undefined, // continuationToken
        undefined, // minMetricsTime
        undefined, // definitionIds
        args.path
      );

      return definitions.map(d => ({
        id: d.id,
        name: d.name,
        path: d.path,
        type: d.type,
        queueStatus: d.queueStatus,
        revision: d.revision,
        url: d._links?.web?.href,
      }));
    },
  },

  // NOTE: queue_build removed - this MCP server is READ-ONLY

  analyze_build_errors: {
    description: 'Analyze a failed build and extract errors, warnings, and issues from logs',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      buildId: z.number().describe('Build ID to analyze'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; buildId: number }) => {
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      // Get build info
      const build = await buildApi.getBuild(project, args.buildId);

      // Get all logs
      const logs = await buildApi.getBuildLogs(project, args.buildId);

      const errors: string[] = [];
      const warnings: string[] = [];
      const issues: { type: string; message: string; logId: number }[] = [];

      // Analyze each log file
      for (const log of logs) {
        if (!log.id) continue;

        try {
          const logLines = await buildApi.getBuildLogLines(project, args.buildId, log.id);

          for (const line of logLines) {
            // Common error patterns
            if (/\berror\b/i.test(line) && !/\b0 error/i.test(line)) {
              errors.push(line.trim());
            }
            // Common warning patterns
            if (/\bwarning\b/i.test(line) && !/\b0 warning/i.test(line)) {
              warnings.push(line.trim());
            }
            // Azure DevOps issue format: ##vso[task.logissue type=error]message
            const issueMatch = line.match(/##vso\[task\.logissue\s+type=(\w+)[^\]]*\](.*)/);
            if (issueMatch) {
              issues.push({
                type: issueMatch[1],
                message: issueMatch[2].trim(),
                logId: log.id,
              });
            }
          }
        } catch {
          // Skip logs that can't be read
        }
      }

      return {
        buildId: build.id,
        buildNumber: build.buildNumber,
        status: build.status !== undefined ? BuildStatus[build.status] : undefined,
        result: build.result !== undefined ? BuildResult[build.result] : undefined,
        summary: {
          errorCount: errors.length,
          warningCount: warnings.length,
          issueCount: issues.length,
        },
        errors: errors.slice(0, 50), // Limit to first 50
        warnings: warnings.slice(0, 50),
        issues: issues.slice(0, 50),
      };
    },
  },
};
