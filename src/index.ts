#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { loadConfig } from './config.js';
import { AzureDevOpsClient } from './azureDevOpsClient.js';
import {
  projectTools,
  gitTools,
  buildTools,
  workItemTools,
  releaseTools,
  pipelineTools,
  testResultsTools,
} from './tools/index.js';

// Combine all tools
const allTools = {
  ...projectTools,
  ...gitTools,
  ...buildTools,
  ...workItemTools,
  ...releaseTools,
  ...pipelineTools,
  ...testResultsTools,
};

type ToolName = keyof typeof allTools;

// Convert Zod schema to JSON Schema for MCP
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodTypeAny;
      properties[key] = zodToJsonSchema(zodValue);

      // Check if required (not optional)
      if (!(zodValue instanceof z.ZodOptional) && !(zodValue instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType);
    return { ...inner, default: schema._def.defaultValue() };
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string', description: schema.description };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number', description: schema.description };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: schema.description };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element),
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema.options,
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(schema.valueSchema),
      description: schema.description,
    };
  }

  // Default fallback
  return { type: 'object' };
}

async function main(): Promise<void> {
  // Load configuration
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    console.error('\nPlease set the required environment variables:');
    console.error('  AZURE_DEVOPS_URL - Your Azure DevOps Server URL');
    console.error('  AZURE_DEVOPS_PAT - Your Personal Access Token');
    console.error('  AZURE_DEVOPS_COLLECTION - Collection name (default: DefaultCollection)');
    process.exit(1);
  }

  // Create Azure DevOps client
  const azureClient = new AzureDevOpsClient(config);

  // Create MCP server
  const server = new Server(
    {
      name: 'azure-devops-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [];

    for (const [name, tool] of Object.entries(allTools)) {
      const inputSchema = tool.inputSchema
        ? zodToJsonSchema(tool.inputSchema as z.ZodTypeAny)
        : { type: 'object', properties: {} };

      tools.push({
        name,
        description: tool.description,
        inputSchema: inputSchema as Tool['inputSchema'],
      });
    }

    return { tools };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!(name in allTools)) {
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }

    const tool = allTools[name as ToolName];

    try {
      // Validate input if schema exists
      let validatedArgs = args || {};
      if (tool.inputSchema) {
        const parseResult = (tool.inputSchema as z.ZodTypeAny).safeParse(args);
        if (!parseResult.success) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid arguments: ${parseResult.error.message}`,
              },
            ],
            isError: true,
          };
        }
        validatedArgs = parseResult.data;
      }

      // Execute tool
      const result = await tool.handler(azureClient, validatedArgs as never);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Azure DevOps MCP Server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
