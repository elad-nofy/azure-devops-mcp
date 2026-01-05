import { z } from 'zod';
import type { AzureDevOpsClient } from '../azureDevOpsClient.js';

export const testResultsTools = {
  list_test_runs: {
    description: 'List test runs for a project - useful for finding test execution history',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      buildUri: z.string().optional().describe('Filter by build URI'),
      top: z.number().optional().default(25).describe('Max runs to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      buildUri?: string;
      top?: number;
    }) => {
      const testApi = await client.getTestApi();
      const project = client.requireProject(args.project);

      const runs = await testApi.getTestRuns(project, args.buildUri);

      return runs.slice(0, args.top || 25).map(r => ({
        id: r.id,
        name: r.name,
        state: r.state,
        totalTests: r.totalTests,
        passedTests: r.passedTests,
        failedTests: r.unanalyzedTests,
        incompleteTests: r.incompleteTests,
        notApplicableTests: r.notApplicableTests,
        startedDate: r.startedDate,
        completedDate: r.completedDate,
        build: r.build ? { id: r.build.id, name: r.build.name } : undefined,
        release: r.release ? { id: r.release.id, name: r.release.name } : undefined,
        url: r.webAccessUrl,
      }));
    },
  },

  get_test_run: {
    description: 'Get detailed information about a specific test run',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      runId: z.number().describe('Test run ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; runId: number }) => {
      const testApi = await client.getTestApi();
      const project = client.requireProject(args.project);

      const run = await testApi.getTestRunById(project, args.runId);

      return {
        id: run.id,
        name: run.name,
        state: run.state,
        totalTests: run.totalTests,
        passedTests: run.passedTests,
        failedTests: run.unanalyzedTests,
        incompleteTests: run.incompleteTests,
        notApplicableTests: run.notApplicableTests,
        startedDate: run.startedDate,
        completedDate: run.completedDate,
        build: run.build,
        release: run.release,
        releaseEnvironmentUri: run.releaseEnvironmentUri,
        comment: run.comment,
        errorMessage: run.errorMessage,
        url: run.webAccessUrl,
      };
    },
  },

  get_test_results: {
    description: 'Get test results from a test run - shows which tests passed/failed',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      runId: z.number().describe('Test run ID'),
      top: z.number().optional().default(100).describe('Max results to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      runId: number;
      top?: number;
    }) => {
      const testApi = await client.getTestApi();
      const project = client.requireProject(args.project);

      const results = await testApi.getTestResults(project, args.runId);

      return results.slice(0, args.top || 100).map(r => ({
        id: r.id,
        testCaseTitle: r.testCaseTitle,
        automatedTestName: r.automatedTestName,
        outcome: r.outcome,
        state: r.state,
        durationInMs: r.durationInMs,
        errorMessage: r.errorMessage,
        stackTrace: r.stackTrace,
        failureType: r.failureType,
        computerName: r.computerName,
        startedDate: r.startedDate,
        completedDate: r.completedDate,
        testCase: r.testCase ? { id: r.testCase.id, name: r.testCase.name } : undefined,
        build: r.build ? { id: r.build.id, name: r.build.name } : undefined,
      }));
    },
  },

  get_failed_tests: {
    description: 'Get failed tests from a test run - useful for investigating failures',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      runId: z.number().describe('Test run ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      runId: number;
    }) => {
      const testApi = await client.getTestApi();
      const project = client.requireProject(args.project);

      const results = await testApi.getTestResults(project, args.runId);

      const failedTests = results.filter(r => r.outcome === 'Failed');

      return {
        runId: args.runId,
        totalTests: results.length,
        failedCount: failedTests.length,
        failedTests: failedTests.map(r => ({
          id: r.id,
          testCaseTitle: r.testCaseTitle,
          automatedTestName: r.automatedTestName,
          durationInMs: r.durationInMs,
          errorMessage: r.errorMessage,
          stackTrace: r.stackTrace?.substring(0, 1000), // Limit stack trace size
          failureType: r.failureType,
          startedDate: r.startedDate,
        })),
      };
    },
  },

  get_test_runs_for_build: {
    description: 'Get test runs associated with a specific build',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      buildId: z.number().describe('Build ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      buildId: number;
    }) => {
      const testApi = await client.getTestApi();
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      // Get build to find URI
      const build = await buildApi.getBuild(project, args.buildId);
      const buildUri = build.uri;

      const runs = await testApi.getTestRuns(project, buildUri);

      return {
        buildId: args.buildId,
        buildNumber: build.buildNumber,
        testRunCount: runs.length,
        testRuns: runs.map(r => ({
          id: r.id,
          name: r.name,
          state: r.state,
          totalTests: r.totalTests,
          passedTests: r.passedTests,
          failedTests: r.unanalyzedTests,
          startedDate: r.startedDate,
          completedDate: r.completedDate,
        })),
        summary: {
          totalTests: runs.reduce((sum, r) => sum + (r.totalTests || 0), 0),
          passedTests: runs.reduce((sum, r) => sum + (r.passedTests || 0), 0),
          failedTests: runs.reduce((sum, r) => sum + (r.unanalyzedTests || 0), 0),
        },
      };
    },
  },

  analyze_test_failures: {
    description: 'Analyze test failures in a build - groups failures by error type',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      buildId: z.number().describe('Build ID to analyze'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      buildId: number;
    }) => {
      const testApi = await client.getTestApi();
      const buildApi = await client.getBuildApi();
      const project = client.requireProject(args.project);

      const build = await buildApi.getBuild(project, args.buildId);
      const runs = await testApi.getTestRuns(project, build.uri);

      const failures: Array<{
        testName: string;
        errorMessage: string | undefined;
        failureType: string | undefined;
        runId: number | undefined;
      }> = [];

      for (const run of runs) {
        if (!run.id) continue;

        const results = await testApi.getTestResults(project, run.id);

        for (const result of results) {
          if (result.outcome === 'Failed') {
            failures.push({
              testName: result.automatedTestName || result.testCaseTitle || 'Unknown',
              errorMessage: result.errorMessage,
              failureType: result.failureType,
              runId: run.id,
            });
          }
        }
      }

      // Group failures by error message similarity
      const groupedByError: Record<string, { count: number; tests: string[] }> = {};
      for (const failure of failures) {
        const key = failure.errorMessage?.substring(0, 100) || 'Unknown error';
        if (!groupedByError[key]) {
          groupedByError[key] = { count: 0, tests: [] };
        }
        groupedByError[key].count++;
        if (groupedByError[key].tests.length < 5) {
          groupedByError[key].tests.push(failure.testName);
        }
      }

      return {
        buildId: args.buildId,
        buildNumber: build.buildNumber,
        totalFailures: failures.length,
        failureGroups: Object.entries(groupedByError)
          .map(([error, data]) => ({
            errorMessage: error,
            count: data.count,
            affectedTests: data.tests,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
      };
    },
  },
};
