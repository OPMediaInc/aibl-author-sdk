import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpServerContext } from '../types.js';
import { enrichWithUrls } from '../utils/urlHelper.js';
import type { ApiEndpointMeta } from '../api/ApiRegistryService.js';

/**
 * OpenApiMcpToolAdapter dynamically converts OpenAPI endpoint manifests into
 * strongly typed Model Context Protocol (MCP) tool registrations.
 */
export class OpenApiMcpToolAdapter {
  /**
   * Registers dynamic MCP tools on the given McpServer from indexed OpenAPI endpoints.
   * Supports filtering by router groups (e.g. "agent", "media,post", "all").
   */
  public static registerTools(
    server: McpServer,
    ctx: McpServerContext,
    filterGroup?: string
  ): void {
    const endpoints = ctx.apiRegistry.listEndpoints();

    for (const ep of endpoints) {
      const segments = ep.routePath.split('.');
      const routerName = segments[0]!;

      if (filterGroup && filterGroup !== 'all') {
        const allowedGroups = filterGroup.split(',').map((g) => g.trim().toLowerCase());
        if (!allowedGroups.includes(routerName.toLowerCase())) {
          continue;
        }
      }

      const toolName = `aibl_${ep.routePath.replace(/\./g, '_')}`;
      const description = ep.summary || ep.description || `Execute ${ep.routePath} (${ep.method})`;

      const schemaMap = this.buildInputSchemaMap(ep);

      (server as any).registerTool(
        toolName,
        {
          description,
          inputSchema: schemaMap,
        },
        async (args: any) => {
          try {
            let current: any = ctx.client;
            for (const seg of segments) {
              if (current === undefined || current === null) {
                throw new Error(`Invalid route segment "${seg}"`);
              }
              current = current[seg];
            }

            let result: unknown;
            if (typeof current === 'function') {
              result = await current(args);
            } else if (ep.procedureType === 'mutation') {
              result = await current.mutate(args);
            } else {
              result = await current.query(args);
            }

            const baseUrl = ctx.baseUrl || ctx.context?.url;
            const enriched = enrichWithUrls(result, baseUrl);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(enriched, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `Error executing ${ep.routePath}: ${error?.shape?.message || error?.message || String(error)}`,
                },
              ],
            };
          }
        }
      );
    }
  }

  /**
   * Converts OpenAPI parameters and request body schemas to a Zod schema map.
   */
  public static buildInputSchemaMap(ep: ApiEndpointMeta): Record<string, z.ZodTypeAny> {
    const schemaMap: Record<string, z.ZodTypeAny> = {};

    // Query & path parameters
    for (const p of ep.parameters) {
      let schema: z.ZodTypeAny = z.string();
      if (p.schema?.type === 'number' || p.schema?.type === 'integer') {
        schema = z.number();
      } else if (p.schema?.type === 'boolean') {
        schema = z.boolean();
      }
      if (p.description) {
        schema = schema.describe(p.description);
      }
      if (!p.required) {
        schema = schema.optional();
      }
      schemaMap[p.name] = schema;
    }

    // Request body properties
    for (const [propName, propSchema] of Object.entries(ep.requestBodyProperties)) {
      let schema: z.ZodTypeAny = z.any();
      if (propSchema.type === 'string') {
        schema = propSchema.enum ? z.enum(propSchema.enum) : z.string();
      } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
        schema = z.number();
      } else if (propSchema.type === 'boolean') {
        schema = z.boolean();
      } else if (propSchema.type === 'array') {
        schema = z.array(z.any());
      } else if (propSchema.type === 'object') {
        schema = z.record(z.string(), z.any());
      }

      if (propSchema.description) {
        schema = schema.describe(propSchema.description);
      }

      const isRequired = ep.requiredBodyProperties.includes(propName);
      if (!isRequired) {
        schema = schema.optional();
      }

      schemaMap[propName] = schema;
    }

    return schemaMap;
  }
}
