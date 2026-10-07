import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpServerContext } from '../types.js';
import { enrichWithUrls } from '../utils/urlHelper.js';

export function registerApiCallTool(server: McpServer, ctx: McpServerContext): void {
  (server as any).registerTool(
    'aibl_api_call',
    {
      description:
        'Universal programmatic API tool for AIBL Author. Allows executing any procedure across all platform endpoints (e.g. "media.rename", "iam.me", "agent.createDraft", "site.listTiers"). If you do not know the exact route name or required parameters, call `aibl_api_describe` first to inspect the schema.',
      inputSchema: {
        route: z.string().describe('API route in dot notation (e.g. "media.rename", "iam.me", "agent.install.list") or REST path ("/iam/me")'),
        input: z.record(z.string(), z.any()).optional().describe('Input payload parameters for the procedure. Omit for zero-argument/void endpoints.'),
        method: z.enum(['auto', 'query', 'mutation']).optional().describe('Procedure method: "query" (GET) or "mutation" (POST). Defaults to auto-detection.'),
      },
    },
    async ({ route, input, method = 'auto' }: any) => {
      try {
        const endpoint = ctx.apiRegistry.findEndpoint(route);
        const pathSegments = endpoint?.routePath ? endpoint.routePath.split('.') : route.replace(/^\/+/, '').replace(/\//g, '.').split('.');

        const isMutation = method === 'mutation' || (method === 'auto' && endpoint?.procedureType === 'mutation');

        let current: any = ctx.client;
        for (const seg of pathSegments) {
          if (current === undefined || current === null) {
            throw new Error(`Invalid route segment "${seg}"`);
          }
          current = current[seg];
        }

        if (current === undefined || current === null) {
          throw new Error(`Procedure "${route}" not found on tRPC client.`);
        }

        const executeCall = async (payload: any) => {
          if (isMutation) {
            if (typeof current.mutate === 'function') {
              return await current.mutate(payload);
            }
            if (typeof current === 'function') {
              return await current(payload);
            }
          }

          if (typeof current.query === 'function') {
            try {
              return await current.query(payload);
            } catch (queryErr: any) {
              const errMsg = String(queryErr?.message || '');
              if (method === 'auto' && (queryErr?.data?.code === 'METHOD_NOT_SUPPORTED' || errMsg.includes('mutation'))) {
                if (typeof current.mutate === 'function') {
                  return await current.mutate(payload);
                }
              }
              throw queryErr;
            }
          }

          if (typeof current.mutate === 'function') {
            return await current.mutate(payload);
          }

          if (typeof current === 'function') {
            // Direct in-memory tRPC caller (appRouter.createCaller(ctx))
            return await current(payload);
          }

          throw new Error(`Procedure "${route}" is not callable on client or caller.`);
        };

        let result: unknown;
        try {
          result = await executeCall(input);
        } catch (initialErr: any) {
          // Defensive retry: If an empty object was passed to a void/no-arg endpoint, retry with undefined
          const isVoidMismatch =
            input &&
            typeof input === 'object' &&
            Object.keys(input).length === 0 &&
            String(initialErr?.message || '').includes('expected void');

          if (isVoidMismatch) {
            result = await executeCall(undefined);
          } else {
            throw initialErr;
          }
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
        const errorMessage = error?.shape?.message || error?.message || String(error);
        const isUnauthorized =
          error?.data?.code === 'UNAUTHORIZED' ||
          error?.shape?.data?.httpStatus === 401 ||
          errorMessage.toLowerCase().includes('unauthorized');

        const unauthorizedGuidance = isUnauthorized
          ? `\n\n[Actionable Guidance for AI]:\nThis endpoint requires authentication (HTTP 401 UNAUTHORIZED). You are currently in public/unauthenticated guest mode. Please inform the user that they must log in using \`aibl auth\` in their terminal to execute protected actions.`
          : '';

        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `API execution error on "${route}": ${errorMessage}${unauthorizedGuidance}\n\nHint: Call \`aibl_api_describe({ route: "${route}" })\` to inspect valid parameters and access levels.`,
            },
          ],
        };
      }
    }
  );
}
