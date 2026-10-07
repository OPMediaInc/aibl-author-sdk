import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getUntypedClient } from '@trpc/client';

// src/mcp/utils/urlHelper.ts
function buildFullUrl(baseUrl, relativePath) {
  if (!baseUrl || !relativePath) {
    return null;
  }
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${cleanBase}${cleanPath}`;
}
function enrichWithUrls(target, baseUrl) {
  if (!baseUrl || !target || typeof target !== "object") {
    return target;
  }
  if (Array.isArray(target)) {
    return target.map((item) => enrichWithUrls(item, baseUrl));
  }
  const obj = target;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "object") {
      result[key] = enrichWithUrls(value, baseUrl);
    } else {
      result[key] = value;
    }
  }
  if (result.webPath && !result.viewUrl) {
    result.viewUrl = buildFullUrl(baseUrl, result.webPath);
  }
  if (result.dashboardPath && !result.manageUrl) {
    result.manageUrl = buildFullUrl(baseUrl, result.dashboardPath);
  }
  if (!result.viewUrl && (result.orgSlug || result.organization?.slug) && (result.siteSlug || result.site?.slug) && result.slug && (result.hasPublishedVersion || result.publishedVersionId)) {
    const org = result.orgSlug || result.organization?.slug;
    const site = result.siteSlug || result.site?.slug;
    result.viewUrl = buildFullUrl(baseUrl, `/orgs/${org}/cores/${site}/posts/${result.slug}`);
  }
  if (!result.manageUrl && (result.orgSlug || result.organization?.slug) && (result.siteSlug || result.site?.slug) && (result.slug || result.hasPublishedVersion !== void 0 || result.publishedVersionId !== void 0 || result.postId) && (result.id || result.postId)) {
    const org = result.orgSlug || result.organization?.slug;
    const site = result.siteSlug || result.site?.slug;
    const id = result.id || result.postId;
    result.manageUrl = buildFullUrl(baseUrl, `/dashboard/organizations/${org}/cores/${site}/posts/${id}`);
  }
  if (!result.viewUrl && (result.organizationSlug || result.orgSlug) && result.slug && (result.accessMode !== void 0 || result.organizationId !== void 0)) {
    const org = result.organizationSlug || result.orgSlug;
    result.viewUrl = buildFullUrl(baseUrl, `/orgs/${org}/cores/${result.slug}`);
  }
  if (!result.manageUrl && (result.organizationSlug || result.orgSlug) && result.slug && (result.accessMode !== void 0 || result.organizationId !== void 0)) {
    const org = result.organizationSlug || result.orgSlug;
    result.manageUrl = buildFullUrl(baseUrl, `/dashboard/organizations/${org}/cores/${result.slug}`);
  }
  if (!result.viewUrl && result.slug && (result.memberCount !== void 0 || result.siteCount !== void 0)) {
    result.viewUrl = buildFullUrl(baseUrl, `/orgs/${result.slug}`);
  }
  if (!result.manageUrl && result.slug && (result.memberCount !== void 0 || result.siteCount !== void 0)) {
    result.manageUrl = buildFullUrl(baseUrl, `/dashboard/organizations/${result.slug}`);
  }
  if (!result.manageUrl && result.id && (result.orgSlug || result.organizationSlug || result.organizationId) && (result.siteSlug !== void 0 || result.siteId !== void 0)) {
    const org = result.orgSlug || result.organizationSlug;
    if (org) {
      result.manageUrl = buildFullUrl(baseUrl, `/dashboard/organizations/${org}/experts/${result.id}`);
    }
  }
  return result;
}

// src/mcp/manifest/mcpCheatSheetManifest.ts
var MCP_CHEAT_SHEET_MANIFEST = [
  {
    title: "AUTHENTICATED / PROTECTED (Requires Login)",
    description: "Use for user-specific data, authoring, management, and mutations.",
    categories: [
      {
        name: "Identity & Permissions",
        routes: ["iam.me"]
      },
      {
        name: "Organizations",
        routes: ["organizations.getMyOrganizations", "organizations.getOrganizationBySlugOrId"]
      },
      {
        name: "Cores / Sites",
        routes: ["site.listAccessible", "site.listByOrganization", "site.getBySlugOrId"]
      },
      {
        name: "Posts & Drafts",
        routes: ["post.listBySite", "post.get", "post.createDraft", "post.delete", "post.discardDraft"]
      },
      {
        name: "Taxonomy",
        routes: ["taxonomy.upsertCategory", "taxonomy.upsertTag", "taxonomy.deleteCategory", "taxonomy.deleteTag"]
      },
      {
        name: "AI Agents",
        routes: ["agent.listAccessible", "agent.listByOrganization", "agent.listBySite", "agent.get"]
      }
    ]
  },
  {
    title: "PUBLIC / GUEST (No Login Required)",
    description: "Use when unauthenticated or querying public reader content.",
    categories: [
      {
        name: "Reader Access",
        routes: [
          "organizations.listReaderOrganizations",
          "organizations.getReaderOrganization",
          "site.getReaderData",
          "post.listReaderPosts",
          "post.getReaderData"
        ]
      },
      {
        name: "Discovery",
        routes: ["search.global"]
      }
    ]
  }
];
var ApiRegistryService = class {
  constructor(logger, initialDoc) {
    this.logger = logger;
    this.initialDoc = initialDoc;
    if (this.initialDoc) {
      this.indexOpenApiDoc(this.initialDoc);
      this.isLoaded = true;
    }
  }
  logger;
  initialDoc;
  endpoints = [];
  routeIndex = /* @__PURE__ */ new Map();
  pathIndex = /* @__PURE__ */ new Map();
  operationIdIndex = /* @__PURE__ */ new Map();
  isLoaded = false;
  /**
   * Loads and indexes openapi.json
   */
  load() {
    if (this.isLoaded) return;
    const openApiPath = this.resolveOpenApiPath();
    if (!openApiPath || !fs.existsSync(openApiPath)) {
      this.logger?.warn?.(`[ApiRegistryService] openapi.json not found at ${openApiPath}`);
      return;
    }
    try {
      const content = fs.readFileSync(openApiPath, "utf-8");
      const openApiDoc = JSON.parse(content);
      this.indexOpenApiDoc(openApiDoc);
      this.isLoaded = true;
    } catch (err) {
      this.logger?.error?.(`[ApiRegistryService] Failed to load openapi.json: ${err?.message ?? String(err)}`);
    }
  }
  /**
   * Find an endpoint by route & procedure or by REST path / operationId.
   */
  findEndpoint(routeOrPath, procedure) {
    this.load();
    const normalizedArg = (routeOrPath || "").trim();
    const normalizedProc = (procedure || "").trim();
    if (normalizedArg && normalizedProc) {
      const key = `${normalizedArg.toLowerCase()}.${normalizedProc.toLowerCase()}`;
      if (this.routeIndex.has(key)) return this.routeIndex.get(key);
      const opId = `${normalizedArg.toLowerCase()}-${normalizedProc.toLowerCase()}`.replace(/\./g, "-");
      if (this.operationIdIndex.has(opId)) return this.operationIdIndex.get(opId);
    }
    const dotKey = normalizedArg.toLowerCase();
    if (this.routeIndex.has(dotKey)) {
      return this.routeIndex.get(dotKey);
    }
    const pathKey = normalizedArg.startsWith("/") ? normalizedArg : `/${normalizedArg}`;
    if (this.pathIndex.has(pathKey)) {
      return this.pathIndex.get(pathKey);
    }
    if (this.operationIdIndex.has(dotKey)) {
      return this.operationIdIndex.get(dotKey);
    }
    return null;
  }
  /**
   * Check if a given string is a top-level router or subrouter name.
   */
  isRouter(name) {
    this.load();
    const clean = (name || "").trim().toLowerCase().replace(/^\/+/, "");
    return this.listRouters().some((r) => r.name.toLowerCase() === clean);
  }
  /**
   * List all top-level routers with summary counts and sample procedures.
   */
  listRouters() {
    this.load();
    const grouped = /* @__PURE__ */ new Map();
    for (const ep of this.endpoints) {
      const segments = ep.routePath.split(".");
      const routerName = segments[0];
      if (!grouped.has(routerName)) {
        grouped.set(routerName, { procedures: [], subrouters: /* @__PURE__ */ new Set() });
      }
      const entry = grouped.get(routerName);
      entry.procedures.push(ep);
      if (segments.length > 2) {
        entry.subrouters.add(segments[1]);
      }
    }
    const summaries = [];
    for (const [name, data] of grouped.entries()) {
      const directProcs = data.procedures.map((p) => {
        const parts = p.routePath.split(".");
        return parts.slice(1).join(".");
      });
      summaries.push({
        name,
        procedureCount: data.procedures.length,
        sampleProcedures: directProcs.slice(0, 4),
        subrouters: Array.from(data.subrouters)
      });
    }
    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }
  /**
   * Find all procedures belonging to a specific router or subrouter.
   */
  findRouter(routerName, subrouter) {
    this.load();
    const rName = (routerName || "").trim().toLowerCase().replace(/^\/+/, "");
    const sName = (subrouter || "").trim().toLowerCase();
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
    const directProcedures = [];
    const subrouters = /* @__PURE__ */ new Map();
    for (const ep of matching) {
      const relative = sName ? ep.routePath.slice(targetPrefix.length) : ep.routePath.slice(targetPrefix.length);
      const parts = relative.split(".");
      if (parts.length > 1 && !sName) {
        const subName = parts[0];
        const group = subrouters.get(subName) || [];
        group.push(ep);
        subrouters.set(subName, group);
      } else {
        directProcedures.push(ep);
      }
    }
    return {
      name: rName,
      subrouter: sName || void 0,
      procedures: directProcedures,
      subrouters
    };
  }
  /**
   * List all indexed endpoints.
   */
  listEndpoints() {
    this.load();
    return this.endpoints;
  }
  /**
   * Search endpoints by keyword matching routePath, restPath, operationId, summary, description, or tags.
   */
  searchEndpoints(query) {
    this.load();
    const q = (query || "").trim().toLowerCase();
    if (!q) {
      return this.endpoints;
    }
    return this.endpoints.filter((ep) => {
      const matchRoute = ep.routePath.toLowerCase().includes(q);
      const matchRest = ep.restPath.toLowerCase().includes(q);
      const matchOp = ep.operationId.toLowerCase().includes(q);
      const matchSummary = (ep.summary || "").toLowerCase().includes(q);
      const matchDesc = (ep.description || "").toLowerCase().includes(q);
      const matchTags = (ep.tags || []).some((t) => t.toLowerCase().includes(q));
      return matchRoute || matchRest || matchOp || matchSummary || matchDesc || matchTags;
    });
  }
  /**
   * Formats top-level router directory for `aibl api --help`.
   */
  formatTopLevelHelp() {
    const routers = this.listRouters();
    const lines = [];
    lines.push("\n\x1B[1mAvailable Top-Level API Routers:\x1B[0m");
    for (const r of routers) {
      const nameCol = `  \u2022 \x1B[1m\x1B[36m${r.name.padEnd(20)}\x1B[0m`;
      const countCol = `\x1B[90m(${r.procedureCount} procedure${r.procedureCount === 1 ? "" : "s"})\x1B[0m`.padEnd(22);
      const subInfo = r.subrouters.length > 0 ? ` [subrouters: ${r.subrouters.join(", ")}]` : "";
      const samples = r.sampleProcedures.length > 0 ? ` e.g. ${r.sampleProcedures.slice(0, 3).join(", ")}...` : "";
      lines.push(`${nameCol} ${countCol}${subInfo}${samples}`);
    }
    lines.push("\n\x1B[1mContextual Help Discovery:\x1B[0m");
    lines.push("  \u2022 View router procedures:    \x1B[32maibl api <router> --help\x1B[0m (e.g. \x1B[32maibl api agent\x1B[0m)");
    lines.push("  \u2022 View subrouter procedures: \x1B[32maibl api <router> <subrouter> --help\x1B[0m (e.g. \x1B[32maibl api agent install\x1B[0m)");
    lines.push("  \u2022 View procedure schema:     \x1B[32maibl api <route> <procedure> --help\x1B[0m (e.g. \x1B[32maibl api agent create --help\x1B[0m)\n");
    return lines.join("\n");
  }
  /**
   * Formats router or subrouter procedure directory for `aibl api <router> --help`.
   */
  formatRouterHelp(routerName, subrouter) {
    const detail = this.findRouter(routerName, subrouter);
    if (!detail) {
      return `
\u274C Router "${routerName}${subrouter ? ` ${subrouter}` : ""}" not found.
   Run \`aibl api --help\` to view all available routers.
`;
    }
    const title = detail.subrouter ? `API Subrouter: ${detail.name}.${detail.subrouter}` : `API Router: ${detail.name}`;
    const totalCount = detail.procedures.length + Array.from(detail.subrouters.values()).reduce((sum, eps) => sum + eps.length, 0);
    const lines = [];
    lines.push("\n=============================================================================");
    lines.push(`  \x1B[1m\x1B[36m${title}\x1B[0m (${totalCount} procedure${totalCount === 1 ? "" : "s"})`);
    lines.push("=============================================================================\n");
    if (detail.procedures.length > 0) {
      lines.push("\x1B[1mProcedures:\x1B[0m");
      for (const ep of detail.procedures) {
        const methodColor = ep.method === "GET" ? "\x1B[32m" : "\x1B[33m";
        const methodStr = `${methodColor}${ep.method.padEnd(6)}\x1B[0m`;
        const pathStr = ep.routePath.padEnd(38);
        const descStr = ep.summary || ep.description || "";
        lines.push(`  ${methodStr} \x1B[1m${pathStr}\x1B[0m ${descStr}`);
      }
      lines.push("");
    }
    if (detail.subrouters.size > 0) {
      lines.push("\x1B[1mSubrouters:\x1B[0m");
      for (const [subName, subEps] of detail.subrouters.entries()) {
        lines.push(`  \u{1F4C1} \x1B[1m\x1B[36m${detail.name}.${subName}\x1B[0m (${subEps.length} procedure${subEps.length === 1 ? "" : "s"}):`);
        for (const ep of subEps) {
          const methodColor = ep.method === "GET" ? "\x1B[32m" : "\x1B[33m";
          const methodStr = `${methodColor}${ep.method.padEnd(6)}\x1B[0m`;
          const pathStr = ep.routePath.padEnd(36);
          const descStr = ep.summary || ep.description || "";
          lines.push(`     ${methodStr} \x1B[1m${pathStr}\x1B[0m ${descStr}`);
        }
        lines.push("");
      }
    }
    lines.push("\x1B[1mNext Steps:\x1B[0m");
    const sampleProc = detail.procedures[0]?.routePath || `${detail.name}.example`;
    const [r, ...p] = sampleProc.split(".");
    lines.push(`  \u2022 View procedure schema:  \x1B[32maibl api ${r} ${p.join(".")} --help\x1B[0m`);
    lines.push(`  \u2022 Execute procedure:      \x1B[32maibl api ${r} ${p.join(".")} -f key=value\x1B[0m
`);
    return lines.join("\n");
  }
  /**
   * Format help text for a specific procedure based on OpenAPI specifications.
   */
  formatHelp(endpoint) {
    const lines = [];
    lines.push("\n=============================================================================");
    lines.push(`  API Endpoint: \x1B[1m\x1B[36m${endpoint.routePath}\x1B[0m (${endpoint.restPath})`);
    lines.push("=============================================================================\n");
    if (endpoint.summary) {
      lines.push(`\x1B[1mSummary:\x1B[0m     ${endpoint.summary}`);
    }
    if (endpoint.description) {
      lines.push(`\x1B[1mDescription:\x1B[0m ${endpoint.description}`);
    }
    lines.push(`\x1B[1mHTTP Method:\x1B[0m \x1B[32m${endpoint.method}\x1B[0m (${endpoint.procedureType})`);
    lines.push(`\x1B[1mtRPC Route:\x1B[0m  ${endpoint.routePath}`);
    lines.push(`\x1B[1mREST Path:\x1B[0m   ${endpoint.restPath}
`);
    if (endpoint.parameters.length > 0) {
      lines.push("\x1B[1mQuery & Path Parameters:\x1B[0m");
      for (const p2 of endpoint.parameters) {
        const reqStr = p2.required ? "\x1B[31m[required]\x1B[0m" : "\x1B[90m[optional]\x1B[0m";
        const typeStr = p2.schema?.type || "string";
        const desc = p2.description ? ` - ${p2.description}` : "";
        lines.push(`  \u2022 \x1B[1m${p2.name}\x1B[0m (${typeStr}) ${reqStr}${desc}`);
      }
      lines.push("");
    }
    const bodyProps = Object.entries(endpoint.requestBodyProperties);
    if (bodyProps.length > 0) {
      lines.push("\x1B[1mRequest Body Fields:\x1B[0m");
      for (const [propName, schema] of bodyProps) {
        const isRequired = endpoint.requiredBodyProperties.includes(propName);
        const reqStr = isRequired ? "\x1B[31m[required]\x1B[0m" : "\x1B[90m[optional]\x1B[0m";
        const typeStr = schema.type || (schema.enum ? `enum (${schema.enum.join("|")})` : "any");
        const desc = schema.description ? ` - ${schema.description}` : "";
        lines.push(`  \u2022 \x1B[1m${propName}\x1B[0m (${typeStr}) ${reqStr}${desc}`);
      }
      lines.push("");
    }
    lines.push("\x1B[1mExamples:\x1B[0m");
    const [r, ...p] = endpoint.routePath.split(".");
    const proc = p.join(".");
    if (endpoint.procedureType === "query" && bodyProps.length === 0 && endpoint.parameters.length === 0) {
      lines.push(`  aibl api ${r} ${proc}`);
    } else {
      const sampleField = bodyProps[0]?.[0] || endpoint.parameters[0]?.name || "id";
      const sampleType = endpoint.parameters.find((p2) => p2.name === sampleField)?.schema?.type || endpoint.requestBodyProperties[sampleField]?.type;
      const isTyped = sampleType === "integer" || sampleType === "number" || sampleType === "boolean";
      const flag = isTyped ? "-F" : "-f";
      const sampleVal = isTyped ? sampleType === "boolean" ? "true" : "1" : "<value>";
      lines.push(`  aibl api ${r} ${proc} ${flag} ${sampleField}=${sampleVal}`);
      lines.push(`  aibl api ${r} ${proc} '{"${sampleField}": ${isTyped ? sampleVal : '"<value>"'}}'`);
    }
    lines.push("\n" + "".padEnd(77, "=") + "\n");
    return lines.join("\n");
  }
  /**
   * Resolves the location of openapi.json across monorepo, SDK package root, and runtime environments.
   */
  resolveOpenApiPath() {
    const currentDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      // 1. In SDK root when running from src/mcp/api
      path.resolve(currentDir, "../../../openapi.json"),
      // 2. In SDK root when running from dist/mcp
      path.resolve(currentDir, "../../openapi.json"),
      // 3. In SDK root when running from dist
      path.resolve(currentDir, "../openapi.json"),
      // 4. Same directory fallback
      path.resolve(currentDir, "./openapi.json")
    ];
    try {
      const require2 = createRequire(import.meta.url);
      const resolvedFromSdk = require2.resolve("@op-media-inc/aibl-author-sdk/openapi.json");
      if (resolvedFromSdk && fs.existsSync(resolvedFromSdk)) {
        return resolvedFromSdk;
      }
    } catch {
    }
    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }
    const extendedCandidates = [
      path.resolve(currentDir, "../../../../packages/@aibl-author/sdk/openapi.json"),
      path.resolve(currentDir, "../../../node_modules/@op-media-inc/aibl-author-sdk/openapi.json"),
      path.resolve(currentDir, "../../../../node_modules/@op-media-inc/aibl-author-sdk/openapi.json"),
      path.resolve(process.env.HOME || "", ".aibl/runtime/lib/node_modules/@op-media-inc/aibl-author-sdk/openapi.json"),
      path.resolve(process.env.HOME || "", ".aibl/runtime/lib/node_modules/@op-media-inc/aibl-author-cli/node_modules/@op-media-inc/aibl-author-sdk/openapi.json"),
      path.resolve(currentDir, "../../../../apps/aibl-author-web/src/app/api/openapi.json")
    ];
    for (const candidate of extendedCandidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  }
  /**
   * Traverses and indexes openapi.json endpoints and aliases.
   */
  indexOpenApiDoc(doc) {
    if (!doc?.paths) return;
    for (const [restPath, pathItem] of Object.entries(doc.paths)) {
      const methods = ["get", "post", "put", "delete", "patch"];
      for (const methodKey of methods) {
        const op = pathItem[methodKey];
        if (!op) continue;
        const method = methodKey.toUpperCase();
        const operationId = op.operationId || "";
        const summary = op.summary;
        const description = op.description;
        const tags = op.tags;
        const routePath = this.deriveRoutePath(operationId, restPath);
        const procedureType = method === "GET" ? "query" : "mutation";
        const parameters = (op.parameters || []).map((p) => ({
          name: p.name,
          in: p.in,
          required: Boolean(p.required),
          description: p.description,
          schema: p.schema
        }));
        const requestBodySchema = op.requestBody?.content?.["application/json"]?.schema || {};
        const requestBodyProperties = requestBodySchema.properties || {};
        const requiredBodyProperties = requestBodySchema.required || [];
        const protect = Boolean(op.security && op.security.length > 0) || op.protect === true;
        const meta = {
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
          requiredBodyProperties
        };
        this.endpoints.push(meta);
        this.routeIndex.set(routePath.toLowerCase(), meta);
        this.pathIndex.set(restPath.toLowerCase(), meta);
        if (operationId) {
          this.operationIdIndex.set(operationId.toLowerCase(), meta);
        }
        this.registerEndpointAliases(routePath, meta);
      }
    }
  }
  registerEndpointAliases(routePath, meta) {
    if (routePath === "agent.listEligibleSubAgents") {
      this.routeIndex.set("agent.delegation.listeligible", meta);
      this.routeIndex.set("agent.delegation.list", meta);
    }
  }
  deriveRoutePath(operationId, restPath) {
    if (operationId) {
      return operationId.replace(/-/g, ".");
    }
    return restPath.replace(/^\/+/, "").replace(/\//g, ".");
  }
};

// src/mcp/manifest/McpInstructionBuilder.ts
function buildMcpInstructions(apiRegistry, manifest, baseUrl) {
  try {
    apiRegistry.load();
  } catch {
  }
  const cleanBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, "") : "http://localhost:3000";
  const lines = [
    `You are connected to the official AIBL Author platform MCP server.`,
    `Base Web URL: ${cleanBaseUrl}`,
    ``,
    `### Dual URL Standards:`,
    `When referencing entities, always output both their Dashboard Management URL and their Public Reader View URL:`,
    `- Organizations:`,
    `  \u2022 Management:   ${cleanBaseUrl}/dashboard/organizations/{orgSlug}`,
    `  \u2022 Public View:  ${cleanBaseUrl}/orgs/{orgSlug}`,
    `- Cores / Sites:`,
    `  \u2022 Management:   ${cleanBaseUrl}/dashboard/organizations/{orgSlug}/cores/{coreSlug}`,
    `  \u2022 Public View:  ${cleanBaseUrl}/orgs/{orgSlug}/cores/{coreSlug}`,
    `- Posts & Articles:`,
    `  \u2022 Management:   ${cleanBaseUrl}/dashboard/organizations/{orgSlug}/cores/{coreSlug}/posts/{postSlugOrId}`,
    `  \u2022 Public View:  ${cleanBaseUrl}/orgs/{orgSlug}/cores/{coreSlug}/posts/{postSlug}`,
    ``,
    `### Operating Rules:`,
    `1. Never present raw database IDs (CUIDs/UUIDs) to the user when human-readable names, slugs, or links can be resolved.`,
    `2. Check authentication first via \`iam.me\`. If unauthenticated (public/guest mode), use Public Reader routes and advise the user to run \`aibl auth\` in their terminal to log in.`,
    `3. To invoke ANY procedure, call the \`aibl_api_call\` tool.`,
    `   - Example: \`aibl_api_call({ route: "<route_name>", input: { <params> } })\``,
    `   - For procedures with no required parameters (e.g. \`iam.me\`), omit the \`input\` argument.`,
    ``,
    `### API Route Cheat Sheet:`
  ];
  for (const section of manifest) {
    lines.push(`
--- ${section.title} ---`);
    if (section.description) {
      lines.push(`(${section.description})`);
    }
    for (const category of section.categories) {
      lines.push(`
\u2022 ${category.name}:`);
      for (const route of category.routes) {
        try {
          const ep = apiRegistry.findEndpoint(route);
          if (!ep) {
            lines.push(`  - route: "${route}"`);
            continue;
          }
          const sampleInput = {};
          for (const p of ep.parameters || []) {
            if (p.required) {
              sampleInput[p.name] = `<${p.schema?.type || "string"}>`;
            }
          }
          for (const [propName, schema] of Object.entries(ep.requestBodyProperties || {})) {
            if (ep.requiredBodyProperties?.includes(propName)) {
              const typeStr = schema?.type || (schema?.enum ? `enum(${schema.enum.join("|")})` : "string");
              sampleInput[propName] = `<${typeStr}>`;
            }
          }
          const summaryComment = ep.summary ? ` // ${ep.summary}` : "";
          if (Object.keys(sampleInput).length === 0) {
            lines.push(`  - route: "${route}"${summaryComment}`);
          } else {
            const inputJson = JSON.stringify(sampleInput);
            lines.push(`  - route: "${route}", input: ${inputJson}${summaryComment}`);
          }
        } catch {
          lines.push(`  - route: "${route}"`);
        }
      }
    }
  }
  lines.push(`
--- EXTENSIONS & LONG-TAIL DISCOVERY ---`);
  lines.push(
    `For platform endpoints not listed above (e.g. invite members, workflows, B2B marketplace, media operations), use \`aibl_api_describe({ query: "<topic>" })\` or \`aibl_api_describe({ route: "<route>" })\` to inspect parameter schemas, then invoke via \`aibl_api_call\`.`
  );
  return lines.join("\n");
}
function formatEndpointSchema(ep) {
  const queryAndPathParameters = ep.parameters.map((p) => ({
    name: p.name,
    type: p.schema?.type || "string",
    required: Boolean(p.required),
    description: p.description || ""
  }));
  const requestBodyProperties = {};
  for (const [propName, propSchema] of Object.entries(ep.requestBodyProperties)) {
    const isRequired = ep.requiredBodyProperties.includes(propName);
    requestBodyProperties[propName] = {
      type: propSchema.type || (propSchema.enum ? `enum (${propSchema.enum.join("|")})` : "any"),
      required: isRequired,
      description: propSchema.description || "",
      ...propSchema.enum ? { enum: propSchema.enum } : {}
    };
  }
  const sampleInput = {};
  for (const p of ep.parameters) {
    if (p.required) {
      sampleInput[p.name] = p.schema?.type === "number" ? 1 : p.schema?.type === "boolean" ? true : `<${p.name}>`;
    }
  }
  for (const [propName, propSchema] of Object.entries(ep.requestBodyProperties)) {
    if (ep.requiredBodyProperties.includes(propName)) {
      sampleInput[propName] = propSchema.type === "number" ? 1 : propSchema.type === "boolean" ? true : `<${propName}>`;
    }
  }
  return {
    route: ep.routePath,
    procedureType: ep.procedureType,
    // "query" or "mutation"
    httpMethod: ep.method,
    restPath: ep.restPath,
    accessLevel: ep.protect ? "protected (authenticated session required)" : "public (unauthenticated)",
    isProtected: ep.protect,
    summary: ep.summary || ep.description || "",
    description: ep.description || "",
    tags: ep.tags,
    parameters: queryAndPathParameters,
    requestBody: requestBodyProperties,
    executionExample: {
      tool: "aibl_api_call",
      arguments: {
        route: ep.routePath,
        input: sampleInput,
        method: ep.procedureType
      }
    }
  };
}
function registerApiDescribeTool(server, ctx) {
  server.registerTool(
    "aibl_api_describe",
    {
      description: "Introspects and discovers API procedures, parameter schemas, and documentation across all AIBL Author platform endpoints. Use this tool to discover route names, required arguments, and JSON payload types before executing `aibl_api_call`.",
      inputSchema: {
        route: z.string().optional().describe('Specific procedure route in dot notation (e.g. "media.rename", "agent.createDraft", "workflow.createDefinition") to inspect its exact parameters and types.'),
        router: z.string().optional().describe('Top-level router name (e.g. "agent", "media", "post", "site", "workflow", "organizations") to list all procedures within that router.'),
        query: z.string().optional().describe('Search keyword across all endpoints to find procedures matching a capability (e.g. "upload", "token", "category", "delegate", "billing").')
      }
    },
    async ({ route, router, query }) => {
      try {
        if (route) {
          const endpoint = ctx.apiRegistry.findEndpoint(route);
          if (!endpoint) {
            const suggestions = ctx.apiRegistry.searchEndpoints(route).slice(0, 5);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Procedure route "${route}" not found.`,
                      suggestions: suggestions.map((s) => ({
                        route: s.routePath,
                        summary: s.summary
                      })),
                      hint: "Use `query` to search for capabilities or `router` to list all procedures in a router."
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
          const schema = formatEndpointSchema(endpoint);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(schema, null, 2)
              }
            ]
          };
        }
        if (router) {
          const routerDetail = ctx.apiRegistry.findRouter(router);
          if (!routerDetail) {
            const allRouters = ctx.apiRegistry.listRouters().map((r) => r.name);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: `Router "${router}" not found.`,
                      availableRouters: allRouters
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
          const procedures = routerDetail.procedures.map((p) => ({
            route: p.routePath,
            method: p.procedureType,
            httpMethod: p.method,
            accessLevel: p.protect ? "protected" : "public",
            summary: p.summary || p.description || "",
            requiredFields: [
              ...p.parameters.filter((param) => param.required).map((param) => param.name),
              ...p.requiredBodyProperties
            ]
          }));
          const subrouterSummary = {};
          for (const [subName, subProcs] of routerDetail.subrouters.entries()) {
            subrouterSummary[`${routerDetail.name}.${subName}`] = subProcs.length;
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    router: routerDetail.name,
                    procedureCount: procedures.length + Object.values(subrouterSummary).reduce((a, b) => a + b, 0),
                    procedures,
                    subrouters: subrouterSummary,
                    hint: 'Call `aibl_api_describe` with `route: "<route_name>"` to inspect full parameter schemas for any procedure.'
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        if (query) {
          const matches = ctx.apiRegistry.searchEndpoints(query);
          const formattedMatches = matches.slice(0, 20).map((m) => ({
            route: m.routePath,
            method: m.procedureType,
            accessLevel: m.protect ? "protected" : "public",
            summary: m.summary || m.description || "",
            requiredFields: [
              ...m.parameters.filter((param) => param.required).map((param) => param.name),
              ...m.requiredBodyProperties
            ]
          }));
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    query,
                    totalMatches: matches.length,
                    results: formattedMatches,
                    hint: 'Call `aibl_api_describe` with `route: "<route_name>"` to inspect full parameter schemas for any procedure.'
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
        const allEndpoints = ctx.apiRegistry.listEndpoints();
        const routers = ctx.apiRegistry.listRouters().map((r) => ({
          name: r.name,
          procedureCount: r.procedureCount,
          subrouters: r.subrouters,
          sampleProcedures: r.sampleProcedures.slice(0, 3).map((p) => `${r.name}.${p}`)
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  overview: `AIBL Author API Catalog (${allEndpoints.length} platform procedures across ${routers.length} routers)`,
                  routers,
                  instructions: {
                    search: 'Call `aibl_api_describe` with `query: "<term>"` to search for procedures.',
                    router: 'Call `aibl_api_describe` with `router: "<name>"` to list procedures in a router.',
                    inspect: 'Call `aibl_api_describe` with `route: "<route>"` to view exact parameter schemas and access levels.',
                    execute: "Call `aibl_api_call` with `route` and `input` to execute any procedure."
                  }
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error describing API: ${error?.message ?? String(error)}`
            }
          ]
        };
      }
    }
  );
}
function registerApiCallTool(server, ctx) {
  server.registerTool(
    "aibl_api_call",
    {
      description: 'Universal programmatic API tool for AIBL Author. Allows executing any procedure across all platform endpoints (e.g. "media.rename", "iam.me", "agent.createDraft", "site.listTiers"). If you do not know the exact route name or required parameters, call `aibl_api_describe` first to inspect the schema.',
      inputSchema: {
        route: z.string().describe('API route in dot notation (e.g. "media.rename", "iam.me", "agent.install.list") or REST path ("/iam/me")'),
        input: z.record(z.string(), z.any()).optional().describe("Input payload parameters for the procedure. Omit for zero-argument/void endpoints."),
        method: z.enum(["auto", "query", "mutation"]).optional().describe('Procedure method: "query" (GET) or "mutation" (POST). Defaults to auto-detection.')
      }
    },
    async ({ route, input, method = "auto" }) => {
      try {
        const endpoint = ctx.apiRegistry.findEndpoint(route);
        const pathSegments = endpoint?.routePath ? endpoint.routePath.split(".") : route.replace(/^\/+/, "").replace(/\//g, ".").split(".");
        const isMutation = method === "mutation" || method === "auto" && endpoint?.procedureType === "mutation";
        let current = ctx.client;
        for (const seg of pathSegments) {
          if (current === void 0 || current === null) {
            throw new Error(`Invalid route segment "${seg}"`);
          }
          current = current[seg];
        }
        if (current === void 0 || current === null) {
          throw new Error(`Procedure "${route}" not found on tRPC client.`);
        }
        const isHttpClient = Boolean(
          typeof getUntypedClient === "function" && getUntypedClient(ctx.client)
        );
        const executeCall = async (payload) => {
          if (!isHttpClient && typeof current === "function") {
            return await current(payload);
          }
          if (isMutation) {
            if (typeof current.mutate === "function") {
              return await current.mutate(payload);
            }
            if (typeof current === "function") {
              return await current(payload);
            }
          }
          if (typeof current.query === "function") {
            try {
              return await current.query(payload);
            } catch (queryErr) {
              const errMsg = String(queryErr?.message || "");
              if (method === "auto" && (queryErr?.data?.code === "METHOD_NOT_SUPPORTED" || errMsg.includes("mutation"))) {
                if (typeof current.mutate === "function") {
                  return await current.mutate(payload);
                }
              }
              throw queryErr;
            }
          }
          if (typeof current.mutate === "function") {
            return await current.mutate(payload);
          }
          if (typeof current === "function") {
            return await current(payload);
          }
          throw new Error(`Procedure "${route}" is not callable on client or caller.`);
        };
        let result;
        try {
          result = await executeCall(input);
        } catch (initialErr) {
          const isVoidMismatch = input && typeof input === "object" && Object.keys(input).length === 0 && String(initialErr?.message || "").includes("expected void");
          if (isVoidMismatch) {
            result = await executeCall(void 0);
          } else {
            throw initialErr;
          }
        }
        const baseUrl = ctx.baseUrl || ctx.context?.url;
        const enriched = enrichWithUrls(result, baseUrl);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(enriched, null, 2)
            }
          ]
        };
      } catch (error) {
        const errorMessage = error?.shape?.message || error?.message || String(error);
        const isUnauthorized = error?.data?.code === "UNAUTHORIZED" || error?.shape?.data?.httpStatus === 401 || errorMessage.toLowerCase().includes("unauthorized");
        const unauthorizedGuidance = isUnauthorized ? `

[Actionable Guidance for AI]:
This endpoint requires authentication (HTTP 401 UNAUTHORIZED). You are currently in public/unauthenticated guest mode. Please inform the user that they must log in using \`aibl auth\` in their terminal to execute protected actions.` : "";
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `API execution error on "${route}": ${errorMessage}${unauthorizedGuidance}

Hint: Call \`aibl_api_describe({ route: "${route}" })\` to inspect valid parameters and access levels.`
            }
          ]
        };
      }
    }
  );
}
var OpenApiMcpToolAdapter = class {
  /**
   * Registers dynamic MCP tools on the given McpServer from indexed OpenAPI endpoints.
   * Supports filtering by router groups (e.g. "agent", "media,post", "all").
   */
  static registerTools(server, ctx, filterGroup) {
    const endpoints = ctx.apiRegistry.listEndpoints();
    for (const ep of endpoints) {
      const segments = ep.routePath.split(".");
      const routerName = segments[0];
      if (filterGroup && filterGroup !== "all") {
        const allowedGroups = filterGroup.split(",").map((g) => g.trim().toLowerCase());
        if (!allowedGroups.includes(routerName.toLowerCase())) {
          continue;
        }
      }
      const toolName = `aibl_${ep.routePath.replace(/\./g, "_")}`;
      const description = ep.summary || ep.description || `Execute ${ep.routePath} (${ep.method})`;
      const schemaMap = this.buildInputSchemaMap(ep);
      server.registerTool(
        toolName,
        {
          description,
          inputSchema: schemaMap
        },
        async (args) => {
          try {
            let current = ctx.client;
            for (const seg of segments) {
              if (current === void 0 || current === null) {
                throw new Error(`Invalid route segment "${seg}"`);
              }
              current = current[seg];
            }
            let result;
            if (typeof current === "function") {
              result = await current(args);
            } else if (ep.procedureType === "mutation") {
              result = await current.mutate(args);
            } else {
              result = await current.query(args);
            }
            const baseUrl = ctx.baseUrl || ctx.context?.url;
            const enriched = enrichWithUrls(result, baseUrl);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(enriched, null, 2)
                }
              ]
            };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Error executing ${ep.routePath}: ${error?.shape?.message || error?.message || String(error)}`
                }
              ]
            };
          }
        }
      );
    }
  }
  /**
   * Converts OpenAPI parameters and request body schemas to a Zod schema map.
   */
  static buildInputSchemaMap(ep) {
    const schemaMap = {};
    for (const p of ep.parameters) {
      let schema = z.string();
      if (p.schema?.type === "number" || p.schema?.type === "integer") {
        schema = z.number();
      } else if (p.schema?.type === "boolean") {
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
    for (const [propName, propSchema] of Object.entries(ep.requestBodyProperties)) {
      let schema = z.any();
      if (propSchema.type === "string") {
        schema = propSchema.enum ? z.enum(propSchema.enum) : z.string();
      } else if (propSchema.type === "number" || propSchema.type === "integer") {
        schema = z.number();
      } else if (propSchema.type === "boolean") {
        schema = z.boolean();
      } else if (propSchema.type === "array") {
        schema = z.array(z.any());
      } else if (propSchema.type === "object") {
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
};
function createAiblMcpServer(options) {
  const {
    clientOrCaller,
    baseUrl,
    serverName = "aibl-author",
    serverVersion = "1.0.0",
    logger
  } = options;
  const apiRegistry = options.apiRegistry ?? new ApiRegistryService(logger, options.openApiDoc);
  apiRegistry.load();
  const cleanBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, "") : "http://localhost:3000";
  const instructions = buildMcpInstructions(apiRegistry, MCP_CHEAT_SHEET_MANIFEST, cleanBaseUrl);
  const server = new McpServer(
    {
      name: serverName,
      version: serverVersion
    },
    {
      instructions
    }
  );
  const ctx = {
    client: clientOrCaller,
    baseUrl: cleanBaseUrl,
    apiRegistry,
    logger,
    context: options.context
  };
  registerApiDescribeTool(server, ctx);
  registerApiCallTool(server, ctx);
  if (options.allTools || options.tools && options.tools.toLowerCase() === "all") {
    OpenApiMcpToolAdapter.registerTools(server, ctx);
  } else if (options.tools) {
    OpenApiMcpToolAdapter.registerTools(server, ctx, options.tools);
  }
  return server;
}

export { ApiRegistryService, MCP_CHEAT_SHEET_MANIFEST, OpenApiMcpToolAdapter, buildFullUrl, buildMcpInstructions, createAiblMcpServer, enrichWithUrls, registerApiCallTool, registerApiDescribeTool };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map