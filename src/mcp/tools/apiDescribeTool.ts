import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpServerContext } from '../types';
import type { ApiEndpointMeta } from '../api/ApiRegistryService';

/**
 * Formats a specific endpoint into a clean schema object for AI consumption.
 */
function formatEndpointSchema(ep: ApiEndpointMeta): Record<string, unknown> {
  const queryAndPathParameters = ep.parameters.map((p) => ({
    name: p.name,
    type: p.schema?.type || 'string',
    required: Boolean(p.required),
    description: p.description || '',
  }));

  const requestBodyProperties: Record<string, unknown> = {};
  for (const [propName, propSchema] of Object.entries(ep.requestBodyProperties)) {
    const isRequired = ep.requiredBodyProperties.includes(propName);
    requestBodyProperties[propName] = {
      type: propSchema.type || (propSchema.enum ? `enum (${propSchema.enum.join('|')})` : 'any'),
      required: isRequired,
      description: propSchema.description || '',
      ...(propSchema.enum ? { enum: propSchema.enum } : {}),
    };
  }

  // Generate example input payload
  const sampleInput: Record<string, unknown> = {};
  for (const p of ep.parameters) {
    if (p.required) {
      sampleInput[p.name] = p.schema?.type === 'number' ? 1 : p.schema?.type === 'boolean' ? true : `<${p.name}>`;
    }
  }
  for (const [propName, propSchema] of Object.entries(ep.requestBodyProperties)) {
    if (ep.requiredBodyProperties.includes(propName)) {
      sampleInput[propName] = propSchema.type === 'number' ? 1 : propSchema.type === 'boolean' ? true : `<${propName}>`;
    }
  }

  return {
    route: ep.routePath,
    procedureType: ep.procedureType, // "query" or "mutation"
    httpMethod: ep.method,
    restPath: ep.restPath,
    accessLevel: ep.protect ? 'protected (authenticated session required)' : 'public (unauthenticated)',
    isProtected: ep.protect,
    summary: ep.summary || ep.description || '',
    description: ep.description || '',
    tags: ep.tags,
    parameters: queryAndPathParameters,
    requestBody: requestBodyProperties,
    executionExample: {
      tool: 'aibl_api_call',
      arguments: {
        route: ep.routePath,
        input: sampleInput,
        method: ep.procedureType,
      },
    },
  };
}

export function registerApiDescribeTool(server: McpServer, ctx: McpServerContext): void {
  (server as any).registerTool(
    'aibl_api_describe',
    {
      description:
        'Introspects and discovers API procedures, parameter schemas, and documentation across all AIBL Author platform endpoints. Use this tool to discover route names, required arguments, and JSON payload types before executing `aibl_api_call`.',
      inputSchema: {
        route: z
          .string()
          .optional()
          .describe('Specific procedure route in dot notation (e.g. "media.rename", "agent.createDraft", "workflow.createDefinition") to inspect its exact parameters and types.'),
        router: z
          .string()
          .optional()
          .describe('Top-level router name (e.g. "agent", "media", "post", "site", "workflow", "organizations") to list all procedures within that router.'),
        query: z
          .string()
          .optional()
          .describe('Search keyword across all endpoints to find procedures matching a capability (e.g. "upload", "token", "category", "delegate", "billing").'),
      },
    },
    async ({ route, router, query }: { route?: string; router?: string; query?: string }) => {
      try {
        // 1. Single Endpoint Deep Introspection
        if (route) {
          const endpoint = ctx.apiRegistry.findEndpoint(route);
          if (!endpoint) {
            const suggestions = ctx.apiRegistry.searchEndpoints(route).slice(0, 5);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      error: `Procedure route "${route}" not found.`,
                      suggestions: suggestions.map((s: any) => ({
                        route: s.routePath,
                        summary: s.summary,
                      })),
                      hint: 'Use `query` to search for capabilities or `router` to list all procedures in a router.',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const schema = formatEndpointSchema(endpoint);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(schema, null, 2),
              },
            ],
          };
        }

        // 2. Router Catalog Introspection
        if (router) {
          const routerDetail = ctx.apiRegistry.findRouter(router);
          if (!routerDetail) {
            const allRouters = ctx.apiRegistry.listRouters().map((r: any) => r.name);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      error: `Router "${router}" not found.`,
                      availableRouters: allRouters,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const procedures = routerDetail.procedures.map((p: any) => ({
            route: p.routePath,
            method: p.procedureType,
            httpMethod: p.method,
            accessLevel: p.protect ? 'protected' : 'public',
            summary: p.summary || p.description || '',
            requiredFields: [
              ...p.parameters.filter((param: any) => param.required).map((param: any) => param.name),
              ...p.requiredBodyProperties,
            ],
          }));

          const subrouterSummary: Record<string, number> = {};
          for (const [subName, subProcs] of routerDetail.subrouters.entries()) {
            subrouterSummary[`${routerDetail.name}.${subName}`] = subProcs.length;
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    router: routerDetail.name,
                    procedureCount: procedures.length + Object.values(subrouterSummary).reduce((a, b) => a + b, 0),
                    procedures,
                    subrouters: subrouterSummary,
                    hint: 'Call `aibl_api_describe` with `route: "<route_name>"` to inspect full parameter schemas for any procedure.',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // 3. Keyword Search Across All Endpoints
        if (query) {
          const matches = ctx.apiRegistry.searchEndpoints(query);
          const formattedMatches = matches.slice(0, 20).map((m: any) => ({
            route: m.routePath,
            method: m.procedureType,
            accessLevel: m.protect ? 'protected' : 'public',
            summary: m.summary || m.description || '',
            requiredFields: [
              ...m.parameters.filter((param: any) => param.required).map((param: any) => param.name),
              ...m.requiredBodyProperties,
            ],
          }));

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    query,
                    totalMatches: matches.length,
                    results: formattedMatches,
                    hint: 'Call `aibl_api_describe` with `route: "<route_name>"` to inspect full parameter schemas for any procedure.',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // 4. Default Catalog Overview
        const allEndpoints = ctx.apiRegistry.listEndpoints();
        const routers = ctx.apiRegistry.listRouters().map((r: any) => ({
          name: r.name,
          procedureCount: r.procedureCount,
          subrouters: r.subrouters,
          sampleProcedures: r.sampleProcedures.slice(0, 3).map((p: any) => `${r.name}.${p}`),
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  overview: `AIBL Author API Catalog (${allEndpoints.length} platform procedures across ${routers.length} routers)`,
                  routers,
                  instructions: {
                    search: 'Call `aibl_api_describe` with `query: "<term>"` to search for procedures.',
                    router: 'Call `aibl_api_describe` with `router: "<name>"` to list procedures in a router.',
                    inspect: 'Call `aibl_api_describe` with `route: "<route>"` to view exact parameter schemas and access levels.',
                    execute: 'Call `aibl_api_call` with `route` and `input` to execute any procedure.',
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error describing API: ${error?.message ?? String(error)}`,
            },
          ],
        };
      }
    }
  );
}
