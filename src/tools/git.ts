import { z } from 'zod';
import type { AzureDevOpsClient } from '../azureDevOpsClient.js';
import type { GitPullRequestSearchCriteria } from 'azure-devops-node-api/interfaces/GitInterfaces.js';

export const gitTools = {
  list_repos: {
    description: 'List all Git repositories in a project',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name (uses default if not specified)'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);
      const repos = await gitApi.getRepositories(project);

      return repos.map(r => ({
        id: r.id,
        name: r.name,
        url: r.url,
        webUrl: r.webUrl,
        defaultBranch: r.defaultBranch,
        size: r.size,
        project: r.project?.name,
      }));
    },
  },

  list_branches: {
    description: 'List branches in a repository',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: { project?: string; repository: string }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);
      const branches = await gitApi.getBranches(args.repository, project);

      return branches.map(b => ({
        name: b.name,
        commit: b.commit?.commitId,
        isBaseVersion: b.isBaseVersion,
        aheadCount: b.aheadCount,
        behindCount: b.behindCount,
      }));
    },
  },

  list_commits: {
    description: 'Get commit history for a repository',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
      branch: z.string().optional().describe('Branch name (e.g., "refs/heads/main")'),
      author: z.string().optional().describe('Filter by author email'),
      fromDate: z.string().optional().describe('Start date (ISO format)'),
      toDate: z.string().optional().describe('End date (ISO format)'),
      top: z.number().optional().default(50).describe('Max commits to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      repository: string;
      branch?: string;
      author?: string;
      fromDate?: string;
      toDate?: string;
      top?: number;
    }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);

      const searchCriteria = {
        itemVersion: args.branch ? { version: args.branch.replace('refs/heads/', '') } : undefined,
        author: args.author,
        fromDate: args.fromDate,
        toDate: args.toDate,
        $top: args.top || 50,
      };

      const commits = await gitApi.getCommits(args.repository, searchCriteria, project);

      return commits.map(c => ({
        commitId: c.commitId,
        comment: c.comment,
        author: {
          name: c.author?.name,
          email: c.author?.email,
          date: c.author?.date,
        },
        committer: {
          name: c.committer?.name,
          email: c.committer?.email,
          date: c.committer?.date,
        },
        changeCounts: c.changeCounts,
        url: c.url,
      }));
    },
  },

  get_commit: {
    description: 'Get detailed information about a specific commit including changes',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
      commitId: z.string().describe('Full commit SHA'),
      includeChanges: z.boolean().optional().default(true).describe('Include file changes'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      repository: string;
      commitId: string;
      includeChanges?: boolean;
    }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);

      const commit = await gitApi.getCommit(args.commitId, args.repository, project, args.includeChanges ? 100 : 0);

      return {
        commitId: commit.commitId,
        comment: commit.comment,
        author: commit.author,
        committer: commit.committer,
        changeCounts: commit.changeCounts,
        changes: commit.changes?.map(ch => ({
          item: {
            path: ch.item?.path,
            gitObjectType: ch.item?.gitObjectType,
          },
          changeType: ch.changeType,
        })),
        parents: commit.parents,
        url: commit.url,
      };
    },
  },

  get_commit_diff: {
    description: 'Get the diff/changes for a file in a commit',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
      commitId: z.string().describe('Commit SHA'),
      path: z.string().describe('File path to get diff for'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      repository: string;
      commitId: string;
      path: string;
    }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);

      // Get the commit to find parent
      const commit = await gitApi.getCommit(args.commitId, args.repository, project);
      const parentCommitId = commit.parents?.[0];

      // Get file content at commit
      const currentContent = await gitApi.getItemContent(
        args.repository,
        args.path,
        project,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { version: args.commitId, versionType: 2 } // 2 = commit
      );

      let previousContent: NodeJS.ReadableStream | undefined;
      if (parentCommitId) {
        try {
          previousContent = await gitApi.getItemContent(
            args.repository,
            args.path,
            project,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            { version: parentCommitId, versionType: 2 }
          );
        } catch {
          // File might not exist in parent (new file)
        }
      }

      // Convert streams to strings
      const streamToString = async (stream: NodeJS.ReadableStream): Promise<string> => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks).toString('utf-8');
      };

      return {
        path: args.path,
        commitId: args.commitId,
        parentCommitId,
        currentContent: currentContent ? await streamToString(currentContent) : null,
        previousContent: previousContent ? await streamToString(previousContent) : null,
      };
    },
  },

  list_pull_requests: {
    description: 'List pull requests in a repository',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
      status: z.enum(['active', 'abandoned', 'completed', 'all']).optional().default('active').describe('PR status filter'),
      creatorId: z.string().optional().describe('Filter by creator ID'),
      reviewerId: z.string().optional().describe('Filter by reviewer ID'),
      top: z.number().optional().default(50).describe('Max PRs to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      repository: string;
      status?: 'active' | 'abandoned' | 'completed' | 'all';
      creatorId?: string;
      reviewerId?: string;
      top?: number;
    }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);

      const statusMap: Record<string, number> = {
        active: 1,
        abandoned: 2,
        completed: 3,
        all: 4,
      };

      const searchCriteria: GitPullRequestSearchCriteria = {
        status: statusMap[args.status || 'active'],
        creatorId: args.creatorId,
        reviewerId: args.reviewerId,
      };

      const prs = await gitApi.getPullRequests(args.repository, searchCriteria, project, undefined, undefined, args.top || 50);

      return prs.map(pr => ({
        pullRequestId: pr.pullRequestId,
        title: pr.title,
        description: pr.description,
        status: pr.status,
        createdBy: pr.createdBy?.displayName,
        creationDate: pr.creationDate,
        sourceRefName: pr.sourceRefName,
        targetRefName: pr.targetRefName,
        mergeStatus: pr.mergeStatus,
        isDraft: pr.isDraft,
        reviewers: pr.reviewers?.map(r => ({
          displayName: r.displayName,
          vote: r.vote,
        })),
        url: pr.url,
      }));
    },
  },

  get_pull_request: {
    description: 'Get detailed information about a pull request including comments and threads',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
      pullRequestId: z.number().describe('Pull request ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      repository: string;
      pullRequestId: number;
    }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);

      const [pr, threads] = await Promise.all([
        gitApi.getPullRequest(args.repository, args.pullRequestId, project),
        gitApi.getThreads(args.repository, args.pullRequestId, project),
      ]);

      return {
        pullRequestId: pr.pullRequestId,
        title: pr.title,
        description: pr.description,
        status: pr.status,
        createdBy: pr.createdBy,
        creationDate: pr.creationDate,
        closedDate: pr.closedDate,
        sourceRefName: pr.sourceRefName,
        targetRefName: pr.targetRefName,
        mergeStatus: pr.mergeStatus,
        isDraft: pr.isDraft,
        reviewers: pr.reviewers,
        commits: pr.commits,
        threads: threads.map(t => ({
          id: t.id,
          status: t.status,
          comments: t.comments?.map(c => ({
            author: c.author?.displayName,
            content: c.content,
            publishedDate: c.publishedDate,
            commentType: c.commentType,
          })),
          threadContext: t.threadContext,
        })),
      };
    },
  },

  compare_branches: {
    description: 'Compare two branches - shows commits in target that are not in base (useful for regression analysis)',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
      baseBranch: z.string().describe('Base branch (e.g., "main" or "refs/heads/main")'),
      targetBranch: z.string().describe('Target branch to compare (e.g., "develop")'),
      top: z.number().optional().default(50).describe('Max commits to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      repository: string;
      baseBranch: string;
      targetBranch: string;
      top?: number;
    }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);

      // Normalize branch names
      const normalizeRef = (ref: string) => ref.startsWith('refs/heads/') ? ref : `refs/heads/${ref}`;
      const baseRef = normalizeRef(args.baseBranch);
      const targetRef = normalizeRef(args.targetBranch);

      // Get commits comparison
      const commitDiffs = await gitApi.getCommitDiffs(
        args.repository,
        project,
        undefined, // diffCommonCommit
        args.top || 50,
        undefined, // skip
        { baseVersionType: 0, baseVersion: baseRef.replace('refs/heads/', '') }, // baseVersionDescriptor
        { targetVersionType: 0, targetVersion: targetRef.replace('refs/heads/', '') } // targetVersionDescriptor
      );

      return {
        baseBranch: args.baseBranch,
        targetBranch: args.targetBranch,
        aheadCount: commitDiffs.aheadCount,
        behindCount: commitDiffs.behindCount,
        commonCommit: commitDiffs.commonCommit,
        changes: commitDiffs.changes?.map(c => ({
          item: {
            path: c.item?.path,
            gitObjectType: c.item?.gitObjectType,
          },
          changeType: c.changeType,
        })),
      };
    },
  },

  search_code: {
    description: 'Search for code/text content in a repository',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
      searchText: z.string().describe('Text to search for in file contents'),
      path: z.string().optional().describe('Folder path to search in (e.g., "/src")'),
      branch: z.string().optional().describe('Branch to search (default: default branch)'),
      fileExtension: z.string().optional().describe('Filter by file extension (e.g., ".cs", ".ts")'),
      top: z.number().optional().default(50).describe('Max results to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      repository: string;
      searchText: string;
      path?: string;
      branch?: string;
      fileExtension?: string;
      top?: number;
    }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);

      // Get repository info to find default branch
      const repo = await gitApi.getRepository(args.repository, project);
      const version = args.branch || repo.defaultBranch?.replace('refs/heads/', '');

      // Get items (files) in the path
      // Note: Uses OneLevel recursion - specify a subfolder path for deeper searches
      const items = await gitApi.getItems(
        args.repository,
        project,
        args.path || '/',
        1, // recursionLevel - OneLevel
        true, // includeContentMetadata
        false, // includeContent
        false // latestProcessedChange
      );

      const results: Array<{
        path: string;
        matches: Array<{ line: number; content: string }>;
      }> = [];

      // Search through files
      for (const item of items || []) {
        if (!item.path || item.isFolder) continue;
        if (args.fileExtension && !item.path.endsWith(args.fileExtension)) continue;

        try {
          const content = await gitApi.getItemContent(
            args.repository,
            item.path,
            project
          );

          // Convert stream to string
          const chunks: Buffer[] = [];
          for await (const chunk of content) {
            chunks.push(Buffer.from(chunk));
          }
          const fileContent = Buffer.concat(chunks).toString('utf-8');

          // Search for matches
          const lines = fileContent.split('\n');
          const matches: Array<{ line: number; content: string }> = [];

          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(args.searchText.toLowerCase())) {
              matches.push({
                line: index + 1,
                content: line.trim().substring(0, 200),
              });
            }
          });

          if (matches.length > 0) {
            results.push({ path: item.path, matches: matches.slice(0, 10) });
          }

          if (results.length >= (args.top || 50)) break;
        } catch {
          // Skip files that can't be read
        }
      }

      return {
        searchText: args.searchText,
        repository: args.repository,
        branch: version,
        resultCount: results.length,
        results: results.slice(0, args.top || 50),
      };
    },
  },

  get_commits_for_work_item: {
    description: 'Find commits associated with a work item ID (searches commit messages for #ID)',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
      workItemId: z.number().describe('Work item ID to search for'),
      top: z.number().optional().default(50).describe('Max commits to return'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      repository: string;
      workItemId: number;
      top?: number;
    }) => {
      const gitApi = await client.getGitApi();
      const project = client.requireProject(args.project);

      // Get recent commits
      const commits = await gitApi.getCommits(
        args.repository,
        { $top: args.top || 50 },
        project
      );

      // Filter commits that mention the work item
      const patterns = [
        `#${args.workItemId}`,
        `AB#${args.workItemId}`,
        `[${args.workItemId}]`,
        `work item ${args.workItemId}`,
      ];

      const relatedCommits = commits.filter(c => {
        const comment = c.comment?.toLowerCase() || '';
        return patterns.some(p => comment.includes(p.toLowerCase()));
      });

      return {
        workItemId: args.workItemId,
        commitCount: relatedCommits.length,
        commits: relatedCommits.map(c => ({
          commitId: c.commitId,
          comment: c.comment,
          author: {
            name: c.author?.name,
            email: c.author?.email,
            date: c.author?.date,
          },
          changeCounts: c.changeCounts,
          url: c.url,
        })),
      };
    },
  },

  get_prs_for_work_item: {
    description: 'Find pull requests linked to a work item',
    inputSchema: z.object({
      project: z.string().optional().describe('Project name'),
      repository: z.string().describe('Repository name or ID'),
      workItemId: z.number().describe('Work item ID'),
    }),
    handler: async (client: AzureDevOpsClient, args: {
      project?: string;
      repository: string;
      workItemId: number;
    }) => {
      const gitApi = await client.getGitApi();
      const witApi = await client.getWorkItemTrackingApi();
      const project = client.requireProject(args.project);

      // Get work item with relations
      const workItem = await witApi.getWorkItem(args.workItemId, undefined, undefined, 4); // 4 = All

      // Find PR links in relations
      const prLinks = workItem.relations?.filter(r =>
        r.rel === 'ArtifactLink' &&
        (r.url?.includes('PullRequestId') || r.url?.includes('vstfs:///Git/PullRequestId'))
      ) || [];

      const prs: Array<{
        pullRequestId: number;
        title: string | undefined;
        status: number | undefined;
        url: string | undefined;
      }> = [];

      for (const link of prLinks) {
        // Extract PR ID from artifact link
        const match = link.url?.match(/PullRequestId[/%](\d+)/i);
        if (match) {
          const prId = parseInt(match[1], 10);
          try {
            const pr = await gitApi.getPullRequest(args.repository, prId, project);
            prs.push({
              pullRequestId: pr.pullRequestId || prId,
              title: pr.title,
              status: pr.status,
              url: pr.url,
            });
          } catch {
            // PR might be in different repo
            prs.push({ pullRequestId: prId, title: undefined, status: undefined, url: link.url });
          }
        }
      }

      // Also search PR titles/descriptions for work item reference
      const allPrs = await gitApi.getPullRequests(args.repository, { status: 4 }, project); // 4 = All
      const patterns = [`#${args.workItemId}`, `AB#${args.workItemId}`];

      for (const pr of allPrs) {
        const text = `${pr.title || ''} ${pr.description || ''}`.toLowerCase();
        if (patterns.some(p => text.includes(p.toLowerCase()))) {
          if (!prs.find(p => p.pullRequestId === pr.pullRequestId)) {
            prs.push({
              pullRequestId: pr.pullRequestId!,
              title: pr.title,
              status: pr.status,
              url: pr.url,
            });
          }
        }
      }

      return {
        workItemId: args.workItemId,
        pullRequestCount: prs.length,
        pullRequests: prs,
      };
    },
  },
};
