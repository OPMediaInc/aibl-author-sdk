import { A as AppRouter } from '../root-CsDAxpod.cjs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import 'next-auth';
import '@prisma/client/runtime/library';
import '@trpc/server/unstable-core-do-not-import';
import '@trpc/server';
import 'trpc-to-openapi';
import '@keycloak/keycloak-admin-client';
import 'node:child_process';
import 'node:buffer';

interface ILogger {
    debug?: (msg: string, ...args: any[]) => void;
    info?: (msg: string, ...args: any[]) => void;
    warn?: (msg: string, ...args: any[]) => void;
    error?: (msg: string, ...args: any[]) => void;
}
interface McpServerContext {
    /**
     * Either a tRPC client (CLI remote over HTTP) or an in-memory tRPC caller (Web SSE / server).
     */
    client: any;
    baseUrl: string;
    apiRegistry: any;
    logger?: ILogger;
    /**
     * Optional context metadata (e.g. CLI context config or server metadata).
     */
    context?: {
        url?: string;
        [key: string]: any;
    };
}
interface CreateAiblMcpServerOptions {
    /**
     * Either an instantiated tRPC client or in-memory tRPC caller (e.g. createCaller(ctx)).
     */
    clientOrCaller: any;
    baseUrl?: string;
    serverName?: string;
    serverVersion?: string;
    apiRegistry?: any;
    allTools?: boolean;
    tools?: string;
    logger?: ILogger;
    context?: {
        url?: string;
        [key: string]: any;
    };
}

declare function buildFullUrl(baseUrl?: string | null, relativePath?: string | null): string | null;
declare function enrichWithUrls<T>(target: T, baseUrl?: string | null): T;

/**
 * Derives strongly-typed dot-notation procedure paths from AppRouter.
 * e.g. "organizations.getMyOrganizations" | "iam.me" | "site.getBySlugOrId" | "agent.install.list"
 */
type ProcedureKeys<TRouter> = {
    [K in keyof TRouter & string]: TRouter[K] extends {
        _def: any;
    } ? K : TRouter[K] extends Record<string, any> ? `${K}.${ProcedureKeys<TRouter[K]>}` : never;
}[keyof TRouter & string];
type AiblApiRoute = ProcedureKeys<AppRouter>;
interface CheatSheetCategory {
    name: string;
    routes: AiblApiRoute[];
}
interface CheatSheetSection {
    title: string;
    description?: string;
    categories: CheatSheetCategory[];
}
declare const MCP_CHEAT_SHEET_MANIFEST: CheatSheetSection[];

interface ApiParameterMeta {
    name: string;
    in: 'query' | 'path' | 'header';
    required: boolean;
    description?: string;
    schema?: Record<string, any>;
}
interface ApiEndpointMeta {
    routePath: string;
    restPath: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    procedureType: 'query' | 'mutation';
    operationId: string;
    summary?: string;
    description?: string;
    tags?: string[];
    protect: boolean;
    parameters: ApiParameterMeta[];
    requestBodyProperties: Record<string, any>;
    requiredBodyProperties: string[];
}
interface RouterSummary {
    name: string;
    procedureCount: number;
    sampleProcedures: string[];
    subrouters: string[];
}
interface RouterDetail {
    name: string;
    subrouter?: string;
    procedures: ApiEndpointMeta[];
    subrouters: Map<string, ApiEndpointMeta[]>;
}
declare class ApiRegistryService {
    private logger?;
    private initialDoc?;
    private endpoints;
    private routeIndex;
    private pathIndex;
    private operationIdIndex;
    private isLoaded;
    constructor(logger?: ILogger | undefined, initialDoc?: any | undefined);
    /**
     * Loads and indexes openapi.json
     */
    load(): void;
    /**
     * Find an endpoint by route & procedure or by REST path / operationId.
     */
    findEndpoint(routeOrPath: string, procedure?: string): ApiEndpointMeta | null;
    /**
     * Check if a given string is a top-level router or subrouter name.
     */
    isRouter(name: string): boolean;
    /**
     * List all top-level routers with summary counts and sample procedures.
     */
    listRouters(): RouterSummary[];
    /**
     * Find all procedures belonging to a specific router or subrouter.
     */
    findRouter(routerName: string, subrouter?: string): RouterDetail | null;
    /**
     * List all indexed endpoints.
     */
    listEndpoints(): ApiEndpointMeta[];
    /**
     * Search endpoints by keyword matching routePath, restPath, operationId, summary, description, or tags.
     */
    searchEndpoints(query: string): ApiEndpointMeta[];
    /**
     * Formats top-level router directory for `aibl api --help`.
     */
    formatTopLevelHelp(): string;
    /**
     * Formats router or subrouter procedure directory for `aibl api <router> --help`.
     */
    formatRouterHelp(routerName: string, subrouter?: string): string;
    /**
     * Format help text for a specific procedure based on OpenAPI specifications.
     */
    formatHelp(endpoint: ApiEndpointMeta): string;
    /**
     * Resolves the location of openapi.json across monorepo, SDK package root, and runtime environments.
     */
    private resolveOpenApiPath;
    /**
     * Traverses and indexes openapi.json endpoints and aliases.
     */
    private indexOpenApiDoc;
    private registerEndpointAliases;
    private deriveRoutePath;
}

/**
 * Builds dynamic, OpenAPI-inferred system instructions and API route cheat sheet
 * for the AIBL Author MCP Server.
 */
declare function buildMcpInstructions(apiRegistry: ApiRegistryService, manifest: CheatSheetSection[], baseUrl: string): string;

declare function registerApiDescribeTool(server: McpServer, ctx: McpServerContext): void;

declare function registerApiCallTool(server: McpServer, ctx: McpServerContext): void;

/**
 * OpenApiMcpToolAdapter dynamically converts OpenAPI endpoint manifests into
 * strongly typed Model Context Protocol (MCP) tool registrations.
 */
declare class OpenApiMcpToolAdapter {
    /**
     * Registers dynamic MCP tools on the given McpServer from indexed OpenAPI endpoints.
     * Supports filtering by router groups (e.g. "agent", "media,post", "all").
     */
    static registerTools(server: McpServer, ctx: McpServerContext, filterGroup?: string): void;
    /**
     * Converts OpenAPI parameters and request body schemas to a Zod schema map.
     */
    static buildInputSchemaMap(ep: ApiEndpointMeta): Record<string, z.ZodTypeAny>;
}

declare function createAiblMcpServer(options: CreateAiblMcpServerOptions): McpServer;

export { type AiblApiRoute, type ApiEndpointMeta, type ApiParameterMeta, ApiRegistryService, type CheatSheetCategory, type CheatSheetSection, type CreateAiblMcpServerOptions, type ILogger, MCP_CHEAT_SHEET_MANIFEST, type McpServerContext, OpenApiMcpToolAdapter, type RouterDetail, type RouterSummary, buildFullUrl, buildMcpInstructions, createAiblMcpServer, enrichWithUrls, registerApiCallTool, registerApiDescribeTool };
