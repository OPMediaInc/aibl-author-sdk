import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { ILogger } from '../types';

export interface ApiParameterMeta {
  name: string;
  in: 'query' | 'path' | 'header';
  required: boolean;
  description?: string;
  schema?: Record<string, any>;
}

export interface ApiEndpointMeta {
  routePath: string; // e.g. "iam.me" or "agent.create" or "agent.install.list"
  restPath: string; // e.g. "/iam/me" or "/agents"
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

export interface RouterSummary {
  name: string;
  procedureCount: number;
  sampleProcedures: string[];
  subrouters: string[];
}

export interface RouterDetail {
  name: string;
  subrouter?: string;
  procedures: ApiEndpointMeta[];
  subrouters: Map<string, ApiEndpointMeta[]>;
}

export class ApiRegistryService {
  private endpoints: ApiEndpointMeta[] = [];
  private routeIndex = new Map<string, ApiEndpointMeta>();
  private pathIndex = new Map<string, ApiEndpointMeta>();
  private operationIdIndex = new Map<string, ApiEndpointMeta>();
  private isLoaded = false;

  constructor(private logger?: ILogger, private initialDoc?: any) {
    if (this.initialDoc) {
      this.indexOpenApiDoc(this.initialDoc);
      this.isLoaded = true;
    }
  }

  /**
   * Loads and indexes openapi.json
   */
  public load(): void {
    if (this.isLoaded) return;

    const openApiPath = this.resolveOpenApiPath();
    if (!openApiPath || !fs.existsSync(openApiPath)) {
      this.logger?.warn?.(`[ApiRegistryService] openapi.json not found at ${openApiPath}`);
      return;
    }

    try {
      const content = fs.readFileSync(openApiPath, 'utf-8');
      const openApiDoc = JSON.parse(content);
      this.indexOpenApiDoc(openApiDoc);
      this.isLoaded = true;
    } catch (err: any) {
      this.logger?.error?.(`[ApiRegistryService] Failed to load openapi.json: ${err?.message ?? String(err)}`);
    }
  }

  /**
   * Find an endpoint by route & procedure or by REST path / operationId.
   */
  public findEndpoint(routeOrPath: string, procedure?: string): ApiEndpointMeta | null {
    this.load();

    const normalizedArg = (routeOrPath || '').trim();
    const normalizedProc = (procedure || '').trim();

    // 1. If both route and procedure provided (e.g. "iam", "me" or "agent.install", "list")
    if (normalizedArg && normalizedProc) {
      const key = `${normalizedArg.toLowerCase()}.${normalizedProc.toLowerCase()}`;
      if (this.routeIndex.has(key)) return this.routeIndex.get(key)!;

      // Try kebab-case or joined operation id
      const opId = `${normalizedArg.toLowerCase()}-${normalizedProc.toLowerCase()}`.replace(/\./g, '-');
      if (this.operationIdIndex.has(opId)) return this.operationIdIndex.get(opId)!;
    }

    // 2. If single argument with dot notation (e.g. "iam.me" or "agent.install.list")
    const dotKey = normalizedArg.toLowerCase();
    if (this.routeIndex.has(dotKey)) {
      return this.routeIndex.get(dotKey)!;
    }

    // 3. Match REST path (e.g. "/iam/me" or "iam/me")
    const pathKey = normalizedArg.startsWith('/') ? normalizedArg : `/${normalizedArg}`;
    if (this.pathIndex.has(pathKey)) {
      return this.pathIndex.get(pathKey)!;
    }

    // 4. Match operationId directly (e.g. "iam-me" or "agent-create")
    if (this.operationIdIndex.has(dotKey)) {
      return this.operationIdIndex.get(dotKey)!;
    }

    return null;
  }

  /**
   * Check if a given string is a top-level router or subrouter name.
   */
  public isRouter(name: string): boolean {
    this.load();
    const clean = (name || '').trim().toLowerCase().replace(/^\/+/, '');
    return this.listRouters().some((r) => r.name.toLowerCase() === clean);
  }

  /**
   * List all top-level routers with summary counts and sample procedures.
   */
  public listRouters(): RouterSummary[] {
    this.load();

    const grouped = new Map<string, { procedures: ApiEndpointMeta[]; subrouters: Set<string> }>();

    for (const ep of this.endpoints) {
      const segments = ep.routePath.split('.');
      const routerName = segments[0]!;

      if (!grouped.has(routerName)) {
        grouped.set(routerName, { procedures: [], subrouters: new Set() });
      }

      const entry = grouped.get(routerName)!;
      entry.procedures.push(ep);

      if (segments.length > 2) {
        entry.subrouters.add(segments[1]!);
      }
    }

    const summaries: RouterSummary[] = [];
    for (const [name, data] of grouped.entries()) {
      const directProcs = data.procedures.map((p) => {
        const parts = p.routePath.split('.');
        return parts.slice(1).join('.');
      });

      summaries.push({
        name,
        procedureCount: data.procedures.length,
        sampleProcedures: directProcs.slice(0, 4),
        subrouters: Array.from(data.subrouters),
      });
    }

    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Find all procedures belonging to a specific router or subrouter.
   */
  public findRouter(routerName: string, subrouter?: string): RouterDetail | null {
    this.load();

    const rName = (routerName || '').trim().toLowerCase().replace(/^\/+/, '');
    const sName = (subrouter || '').trim().toLowerCase();

    const targetPrefix = sName ? `${rName}.${sName}.` : `${rName}.`;
    const exactSubrouterPrefix = `${rName}.${sName}`;

    const matching = this.endpoints.filter((ep) => {
      const lower = ep.routePath.toLowerCase();
      if (sName) {
        return lower.startsWith(targetPrefix) || lower === exactSubrouterPrefix;
      }
      return lower.startsWith(targetPrefix);
    });

    if (matching.length === 0) {
      return null;
    }

    const directProcedures: ApiEndpointMeta[] = [];
    const subrouters = new Map<string, ApiEndpointMeta[]>();

    for (const ep of matching) {
      const relative = sName
        ? ep.routePath.slice(targetPrefix.length)
        : ep.routePath.slice(targetPrefix.length);

      const parts = relative.split('.');
      if (parts.length > 1 && !sName) {
        const subName = parts[0]!;
        const group = subrouters.get(subName) || [];
        group.push(ep);
        subrouters.set(subName, group);
      } else {
        directProcedures.push(ep);
      }
    }

    return {
      name: rName,
      subrouter: sName || undefined,
      procedures: directProcedures,
      subrouters,
    };
  }

  /**
   * List all indexed endpoints.
   */
  public listEndpoints(): ApiEndpointMeta[] {
    this.load();
    return this.endpoints;
  }

  /**
   * Search endpoints by keyword matching routePath, restPath, operationId, summary, description, or tags.
   */
  public searchEndpoints(query: string): ApiEndpointMeta[] {
    this.load();
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      return this.endpoints;
    }

    return this.endpoints.filter((ep) => {
      const matchRoute = ep.routePath.toLowerCase().includes(q);
      const matchRest = ep.restPath.toLowerCase().includes(q);
      const matchOp = ep.operationId.toLowerCase().includes(q);
      const matchSummary = (ep.summary || '').toLowerCase().includes(q);
      const matchDesc = (ep.description || '').toLowerCase().includes(q);
      const matchTags = (ep.tags || []).some((t) => t.toLowerCase().includes(q));

      return matchRoute || matchRest || matchOp || matchSummary || matchDesc || matchTags;
    });
  }

  /**
   * Formats top-level router directory for `aibl api --help`.
   */
  public formatTopLevelHelp(): string {
    const routers = this.listRouters();
    const lines: string[] = [];

    lines.push('\n\x1b[1mAvailable Top-Level API Routers:\x1b[0m');
    for (const r of routers) {
      const nameCol = `  • \x1b[1m\x1b[36m${r.name.padEnd(20)}\x1b[0m`;
      const countCol = `\x1b[90m(${r.procedureCount} procedure${r.procedureCount === 1 ? '' : 's'})\x1b[0m`.padEnd(22);
      const subInfo = r.subrouters.length > 0 ? ` [subrouters: ${r.subrouters.join(', ')}]` : '';
      const samples = r.sampleProcedures.length > 0 ? ` e.g. ${r.sampleProcedures.slice(0, 3).join(', ')}...` : '';
      lines.push(`${nameCol} ${countCol}${subInfo}${samples}`);
    }

    lines.push('\n\x1b[1mContextual Help Discovery:\x1b[0m');
    lines.push('  • View router procedures:    \x1b[32maibl api <router> --help\x1b[0m (e.g. \x1b[32maibl api agent\x1b[0m)');
    lines.push('  • View subrouter procedures: \x1b[32maibl api <router> <subrouter> --help\x1b[0m (e.g. \x1b[32maibl api agent install\x1b[0m)');
    lines.push('  • View procedure schema:     \x1b[32maibl api <route> <procedure> --help\x1b[0m (e.g. \x1b[32maibl api agent create --help\x1b[0m)\n');

    return lines.join('\n');
  }

  /**
   * Formats router or subrouter procedure directory for `aibl api <router> --help`.
   */
  public formatRouterHelp(routerName: string, subrouter?: string): string {
    const detail = this.findRouter(routerName, subrouter);
    if (!detail) {
      return `\n❌ Router "${routerName}${subrouter ? ` ${subrouter}` : ''}" not found.\n   Run \`aibl api --help\` to view all available routers.\n`;
    }

    const title = detail.subrouter
      ? `API Subrouter: ${detail.name}.${detail.subrouter}`
      : `API Router: ${detail.name}`;

    const totalCount = detail.procedures.length + Array.from(detail.subrouters.values()).reduce((sum, eps) => sum + eps.length, 0);

    const lines: string[] = [];
    lines.push('\n=============================================================================');
    lines.push(`  \x1b[1m\x1b[36m${title}\x1b[0m (${totalCount} procedure${totalCount === 1 ? '' : 's'})`);
    lines.push('=============================================================================\n');

    if (detail.procedures.length > 0) {
      lines.push('\x1b[1mProcedures:\x1b[0m');
      for (const ep of detail.procedures) {
        const methodColor = ep.method === 'GET' ? '\x1b[32m' : '\x1b[33m';
        const methodStr = `${methodColor}${ep.method.padEnd(6)}\x1b[0m`;
        const pathStr = ep.routePath.padEnd(38);
        const descStr = ep.summary || ep.description || '';
        lines.push(`  ${methodStr} \x1b[1m${pathStr}\x1b[0m ${descStr}`);
      }
      lines.push('');
    }

    if (detail.subrouters.size > 0) {
      lines.push('\x1b[1mSubrouters:\x1b[0m');
      for (const [subName, subEps] of detail.subrouters.entries()) {
        lines.push(`  📁 \x1b[1m\x1b[36m${detail.name}.${subName}\x1b[0m (${subEps.length} procedure${subEps.length === 1 ? '' : 's'}):`);
        for (const ep of subEps) {
          const methodColor = ep.method === 'GET' ? '\x1b[32m' : '\x1b[33m';
          const methodStr = `${methodColor}${ep.method.padEnd(6)}\x1b[0m`;
          const pathStr = ep.routePath.padEnd(36);
          const descStr = ep.summary || ep.description || '';
          lines.push(`     ${methodStr} \x1b[1m${pathStr}\x1b[0m ${descStr}`);
        }
        lines.push('');
      }
    }

    lines.push('\x1b[1mNext Steps:\x1b[0m');
    const sampleProc = detail.procedures[0]?.routePath || `${detail.name}.example`;
    const [r, ...p] = sampleProc.split('.');
    lines.push(`  • View procedure schema:  \x1b[32maibl api ${r} ${p.join('.')} --help\x1b[0m`);
    lines.push(`  • Execute procedure:      \x1b[32maibl api ${r} ${p.join('.')} -f key=value\x1b[0m\n`);

    return lines.join('\n');
  }

  /**
   * Format help text for a specific procedure based on OpenAPI specifications.
   */
  public formatHelp(endpoint: ApiEndpointMeta): string {
    const lines: string[] = [];

    lines.push('\n=============================================================================');
    lines.push(`  API Endpoint: \x1b[1m\x1b[36m${endpoint.routePath}\x1b[0m (${endpoint.restPath})`);
    lines.push('=============================================================================\n');

    if (endpoint.summary) {
      lines.push(`\x1b[1mSummary:\x1b[0m     ${endpoint.summary}`);
    }
    if (endpoint.description) {
      lines.push(`\x1b[1mDescription:\x1b[0m ${endpoint.description}`);
    }

    lines.push(`\x1b[1mHTTP Method:\x1b[0m \x1b[32m${endpoint.method}\x1b[0m (${endpoint.procedureType})`);
    lines.push(`\x1b[1mtRPC Route:\x1b[0m  ${endpoint.routePath}`);
    lines.push(`\x1b[1mREST Path:\x1b[0m   ${endpoint.restPath}\n`);

    if (endpoint.parameters.length > 0) {
      lines.push('\x1b[1mQuery & Path Parameters:\x1b[0m');
      for (const p of endpoint.parameters) {
        const reqStr = p.required ? '\x1b[31m[required]\x1b[0m' : '\x1b[90m[optional]\x1b[0m';
        const typeStr = p.schema?.type || 'string';
        const desc = p.description ? ` - ${p.description}` : '';
        lines.push(`  • \x1b[1m${p.name}\x1b[0m (${typeStr}) ${reqStr}${desc}`);
      }
      lines.push('');
    }

    const bodyProps = Object.entries(endpoint.requestBodyProperties);
    if (bodyProps.length > 0) {
      lines.push('\x1b[1mRequest Body Fields:\x1b[0m');
      for (const [propName, schema] of bodyProps) {
        const isRequired = endpoint.requiredBodyProperties.includes(propName);
        const reqStr = isRequired ? '\x1b[31m[required]\x1b[0m' : '\x1b[90m[optional]\x1b[0m';
        const typeStr = schema.type || (schema.enum ? `enum (${schema.enum.join('|')})` : 'any');
        const desc = schema.description ? ` - ${schema.description}` : '';
        lines.push(`  • \x1b[1m${propName}\x1b[0m (${typeStr}) ${reqStr}${desc}`);
      }
      lines.push('');
    }

    lines.push('\x1b[1mExamples:\x1b[0m');
    const [r, ...p] = endpoint.routePath.split('.');
    const proc = p.join('.');

    if (endpoint.procedureType === 'query' && bodyProps.length === 0 && endpoint.parameters.length === 0) {
      lines.push(`  aibl api ${r} ${proc}`);
    } else {
      const sampleField = bodyProps[0]?.[0] || endpoint.parameters[0]?.name || 'id';
      const sampleType = endpoint.parameters.find((p) => p.name === sampleField)?.schema?.type || endpoint.requestBodyProperties[sampleField]?.type;
      const isTyped = sampleType === 'integer' || sampleType === 'number' || sampleType === 'boolean';
      const flag = isTyped ? '-F' : '-f';
      const sampleVal = isTyped ? (sampleType === 'boolean' ? 'true' : '1') : '<value>';
      lines.push(`  aibl api ${r} ${proc} ${flag} ${sampleField}=${sampleVal}`);
      lines.push(`  aibl api ${r} ${proc} '{"${sampleField}": ${isTyped ? sampleVal : '"<value>"'}}'`);
    }

    lines.push('\n' + ''.padEnd(77, '=') + '\n');
    return lines.join('\n');
  }

  /**
   * Resolves the location of openapi.json across monorepo, SDK package root, and runtime environments.
   */
  private resolveOpenApiPath(): string {
    const currentDir = typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));

    const candidates = [
      // 1. In SDK root when running from src/mcp/api
      path.resolve(currentDir, '../../../openapi.json'),
      // 2. In SDK root when running from dist/mcp
      path.resolve(currentDir, '../../openapi.json'),
      // 3. In SDK root when running from dist
      path.resolve(currentDir, '../openapi.json'),
      // 4. Same directory fallback
      path.resolve(currentDir, './openapi.json'),
    ];

    // Try module resolution
    try {
      const require = createRequire(import.meta.url);
      const resolvedFromSdk = require.resolve('@op-media-inc/aibl-author-sdk/openapi.json');
      if (resolvedFromSdk && fs.existsSync(resolvedFromSdk)) {
        return resolvedFromSdk;
      }
    } catch {
      // Ignore and proceed to filesystem candidates
    }

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Extended search candidates for CLI and standalone installer (~/.aibl)
    const extendedCandidates = [
      path.resolve(currentDir, '../../../../packages/@aibl-author/sdk/openapi.json'),
      path.resolve(currentDir, '../../../node_modules/@op-media-inc/aibl-author-sdk/openapi.json'),
      path.resolve(currentDir, '../../../../node_modules/@op-media-inc/aibl-author-sdk/openapi.json'),
      path.resolve(process.env.HOME || '', '.aibl/runtime/lib/node_modules/@op-media-inc/aibl-author-sdk/openapi.json'),
      path.resolve(process.env.HOME || '', '.aibl/runtime/lib/node_modules/@op-media-inc/aibl-author-cli/node_modules/@op-media-inc/aibl-author-sdk/openapi.json'),
      path.resolve(currentDir, '../../../../apps/aibl-author-web/src/app/api/openapi.json'),
    ];

    for (const candidate of extendedCandidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return candidates[0]!;
  }

  /**
   * Traverses and indexes openapi.json endpoints and aliases.
   */
  private indexOpenApiDoc(doc: any): void {
    if (!doc?.paths) return;

    for (const [restPath, pathItem] of Object.entries<any>(doc.paths)) {
      const methods = ['get', 'post', 'put', 'delete', 'patch'] as const;

      for (const methodKey of methods) {
        const op = pathItem[methodKey];
        if (!op) continue;

        const method = methodKey.toUpperCase() as ApiEndpointMeta['method'];
        const operationId: string = op.operationId || '';
        const summary: string | undefined = op.summary;
        const description: string | undefined = op.description;
        const tags: string[] | undefined = op.tags;

        const routePath = this.deriveRoutePath(operationId, restPath);
        const procedureType: 'query' | 'mutation' = method === 'GET' ? 'query' : 'mutation';

        const parameters: ApiParameterMeta[] = (op.parameters || []).map((p: any) => ({
          name: p.name,
          in: p.in,
          required: Boolean(p.required),
          description: p.description,
          schema: p.schema,
        }));

        const requestBodySchema = op.requestBody?.content?.['application/json']?.schema || {};
        const requestBodyProperties = requestBodySchema.properties || {};
        const requiredBodyProperties = requestBodySchema.required || [];
        const protect = Boolean(op.security && op.security.length > 0) || op.protect === true;

        const meta: ApiEndpointMeta = {
          routePath,
          restPath,
          method,
          procedureType,
          operationId,
          summary,
          description,
          tags,
          protect,
          parameters,
          requestBodyProperties,
          requiredBodyProperties,
        };

        this.endpoints.push(meta);

        // Index by route path (e.g. "iam.me")
        this.routeIndex.set(routePath.toLowerCase(), meta);

        // Index by REST path (e.g. "/iam/me")
        this.pathIndex.set(restPath.toLowerCase(), meta);

        // Index by operation ID (e.g. "iam-me")
        if (operationId) {
          this.operationIdIndex.set(operationId.toLowerCase(), meta);
        }

        // Register helpful aliases
        this.registerEndpointAliases(routePath, meta);
      }
    }
  }

  private registerEndpointAliases(routePath: string, meta: ApiEndpointMeta): void {
    if (routePath === 'agent.listEligibleSubAgents') {
      this.routeIndex.set('agent.delegation.listeligible', meta);
      this.routeIndex.set('agent.delegation.list', meta);
    }
  }

  private deriveRoutePath(operationId: string, restPath: string): string {
    if (operationId) {
      return operationId.replace(/-/g, '.');
    }

    // Derive from /foo/bar -> foo.bar
    return restPath.replace(/^\/+/, '').replace(/\//g, '.');
  }
}
