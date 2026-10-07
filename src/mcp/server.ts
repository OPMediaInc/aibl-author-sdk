import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CreateAiblMcpServerOptions, McpServerContext } from './types';
import { ApiRegistryService } from './api/ApiRegistryService';
import { MCP_CHEAT_SHEET_MANIFEST } from './manifest/mcpCheatSheetManifest';
import { buildMcpInstructions } from './manifest/McpInstructionBuilder';
import { registerApiDescribeTool } from './tools/apiDescribeTool';
import { registerApiCallTool } from './tools/apiCallTool';
import { OpenApiMcpToolAdapter } from './tools/OpenApiMcpToolAdapter';

export function createAiblMcpServer(options: CreateAiblMcpServerOptions): McpServer {
  const {
    clientOrCaller,
    baseUrl,
    serverName = 'aibl-author',
    serverVersion = '1.0.0',
    logger,
  } = options;

  const apiRegistry: ApiRegistryService =
    options.apiRegistry ?? new ApiRegistryService(logger, options.openApiDoc);
  apiRegistry.load();

  const cleanBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : 'http://localhost:3000';
  const instructions = buildMcpInstructions(apiRegistry, MCP_CHEAT_SHEET_MANIFEST, cleanBaseUrl);

  const server = new McpServer(
    {
      name: serverName,
      version: serverVersion,
    },
    {
      instructions,
    }
  );

  const ctx: McpServerContext = {
    client: clientOrCaller,
    baseUrl: cleanBaseUrl,
    apiRegistry,
    logger,
    context: options.context,
  };

  // 1. Register Core Universal Reflection Tools
  registerApiDescribeTool(server, ctx);
  registerApiCallTool(server, ctx);

  // 2. Register Dynamic Tools if explicitly opted into
  if (options.allTools || (options.tools && options.tools.toLowerCase() === 'all')) {
    OpenApiMcpToolAdapter.registerTools(server, ctx);
  } else if (options.tools) {
    OpenApiMcpToolAdapter.registerTools(server, ctx, options.tools);
  }

  return server;
}
