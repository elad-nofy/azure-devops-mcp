# Azure DevOps MCP Server

A **READ-ONLY** MCP (Model Context Protocol) server that connects AI assistants to Azure DevOps Server (on-premises). Works with Claude Code CLI, VS Code AI extensions (Continue, Cline), Cursor, and any MCP-compatible client.

## Features

- **Projects**: List and explore projects
- **Git/Repos**: Browse repositories, commits, branches, pull requests, diffs, and code search
- **Builds**: List builds, view logs, analyze errors
- **Work Items**: Query work items, find linked commits/PRs
- **Releases**: View releases and deployment status
- **Pipelines**: List YAML pipelines, view runs, get pipeline configuration
- **Test Results**: View test runs, results, and analyze failures

## Prerequisites

- Node.js 18 or higher
- Azure DevOps Server 2020 or 2022 (on-premises)
- Personal Access Token (PAT) with read scopes

## Installation

### Option 1: npm (Recommended)

```bash
npx azure-devops-mcp@latest
```

### Option 2: Clone and Build

```bash
git clone https://github.com/your-username/azure-devops-mcp.git
cd azure-devops-mcp
npm install
npm run build
```

## Configuration

### Create a Personal Access Token (PAT)

1. Go to Azure DevOps Server
2. Click on your profile icon > Security > Personal access tokens
3. Create a new token with the following scopes:
   - **Code**: Read
   - **Build**: Read
   - **Work Items**: Read
   - **Release**: Read
   - **Test Management**: Read

### Configure MCP Client

#### Claude Code CLI

Add to your project's `.mcp.json` or global settings:

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["azure-devops-mcp@latest"],
      "env": {
        "AZURE_DEVOPS_URL": "http://your-tfs-server:8080/tfs/YourCollection",
        "AZURE_DEVOPS_PAT": "your-personal-access-token",
        "AZURE_DEVOPS_PROJECT": "YourDefaultProject"
      }
    }
  }
}
```

#### VS Code (Continue/Cline)

Add similar configuration to the extension's MCP settings.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_DEVOPS_URL` | Yes | Server URL including collection (e.g., `http://tfs:8080/tfs/DefaultCollection`) |
| `AZURE_DEVOPS_PAT` | Yes | Personal Access Token |
| `AZURE_DEVOPS_PROJECT` | No | Default project for commands |

## Available Tools

### Projects
| Tool | Description |
|------|-------------|
| `list_projects` | List all projects in the organization |
| `get_project` | Get detailed project information |

### Git / Repositories
| Tool | Description |
|------|-------------|
| `list_repos` | List repositories in a project |
| `list_branches` | List branches in a repository |
| `list_commits` | Get commit history with filters |
| `get_commit` | Get commit details with changes |
| `get_commit_diff` | Get file diff for a commit |
| `list_pull_requests` | List pull requests |
| `get_pull_request` | Get PR details with comments |
| `compare_branches` | Compare two branches (regression analysis) |
| `search_code` | Search for text in repository files |
| `get_commits_for_work_item` | Find commits referencing a work item |
| `get_prs_for_work_item` | Find PRs linked to a work item |

### Builds
| Tool | Description |
|------|-------------|
| `list_builds` | List recent builds |
| `get_build` | Get build details |
| `get_build_logs` | Get build logs |
| `list_build_definitions` | List build definitions |
| `analyze_build_errors` | Extract errors from failed builds |

### Work Items
| Tool | Description |
|------|-------------|
| `query_work_items` | Search work items (WIQL or filters) |
| `get_work_item` | Get work item details |
| `list_work_item_types` | List available work item types |

### Releases
| Tool | Description |
|------|-------------|
| `list_releases` | List releases |
| `get_release` | Get release details |
| `list_release_definitions` | List release definitions |
| `get_release_logs` | Get deployment logs |

### Pipelines
| Tool | Description |
|------|-------------|
| `list_pipelines` | List YAML pipelines |
| `get_pipeline_runs` | Get recent pipeline runs |
| `get_pipeline_yaml` | Get pipeline YAML configuration |
| `get_pipeline_variables` | Get pipeline variables |

### Test Results
| Tool | Description |
|------|-------------|
| `list_test_runs` | List test runs in a project |
| `get_test_run` | Get test run details |
| `get_test_results` | Get test results from a run |
| `get_failed_tests` | Get failed tests from a run |
| `get_test_runs_for_build` | Get test runs for a specific build |
| `analyze_test_failures` | Analyze and group test failures |

## Usage Examples

Once configured, you can ask your AI assistant questions like:

- "Show me the recent builds for project X"
- "What's the status of PR #123?"
- "List all bugs assigned to me"
- "Show me the commits from last week"
- "Why did build #456 fail?"
- "What tests failed in build #789?"
- "Compare branches Dev/9.1 and Dev/9.2"
- "Search for 'IMediator' in the Controllers folder"

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## Troubleshooting

### Connection errors
- Verify `AZURE_DEVOPS_URL` is correct and accessible
- Check if your PAT has not expired
- Ensure your network allows connection to the server

### Permission errors
- Verify PAT has required scopes
- Check if you have access to the project/repository

### "Project is required" errors
- Set `AZURE_DEVOPS_PROJECT` environment variable, or
- Pass `project` parameter in tool calls

## License

MIT
