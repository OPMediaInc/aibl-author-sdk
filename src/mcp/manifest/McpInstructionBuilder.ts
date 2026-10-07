import { ApiRegistryService } from '../api/ApiRegistryService.js';
import type { CheatSheetSection } from './mcpCheatSheetManifest.js';

/**
 * Builds dynamic, OpenAPI-inferred system instructions and API route cheat sheet
 * for the AIBL Author MCP Server.
 */
export function buildMcpInstructions(
  apiRegistry: ApiRegistryService,
  manifest: CheatSheetSection[],
  baseUrl: string
): string {
  try {
    apiRegistry.load();
  } catch {
    // Gracefully proceed even if openapi.json cannot be read immediately
  }

  const cleanBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : 'http://localhost:3000';

  const lines: string[] = [
    `You are connected to the official AIBL Author platform MCP server.`,
    `Base Web URL: ${cleanBaseUrl}`,
    ``,
    `### Dual URL Standards:`,
    `When referencing entities, always output both their Dashboard Management URL and their Public Reader View URL:`,
    `- Organizations:`,
    `  • Management:   ${cleanBaseUrl}/dashboard/organizations/{orgSlug}`,
    `  • Public View:  ${cleanBaseUrl}/orgs/{orgSlug}`,
    `- Cores / Sites:`,
    `  • Management:   ${cleanBaseUrl}/dashboard/organizations/{orgSlug}/cores/{coreSlug}`,
    `  • Public View:  ${cleanBaseUrl}/orgs/{orgSlug}/cores/{coreSlug}`,
    `- Posts & Articles:`,
    `  • Management:   ${cleanBaseUrl}/dashboard/organizations/{orgSlug}/cores/{coreSlug}/posts/{postSlugOrId}`,
    `  • Public View:  ${cleanBaseUrl}/orgs/{orgSlug}/cores/{coreSlug}/posts/{postSlug}`,
    ``,
    `### Operating Rules:`,
    `1. Never present raw database IDs (CUIDs/UUIDs) to the user when human-readable names, slugs, or links can be resolved.`,
    `2. Check authentication first via \`iam.me\`. If unauthenticated (public/guest mode), use Public Reader routes and advise the user to run \`aibl auth\` in their terminal to log in.`,
    `3. To invoke ANY procedure, call the \`aibl_api_call\` tool.`,
    `   - Example: \`aibl_api_call({ route: "<route_name>", input: { <params> } })\``,
    `   - For procedures with no required parameters (e.g. \`iam.me\`), omit the \`input\` argument.`,
    ``,
    `### API Route Cheat Sheet:`,
  ];

  for (const section of manifest) {
    lines.push(`\n--- ${section.title} ---`);
    if (section.description) {
      lines.push(`(${section.description})`);
    }

    for (const category of section.categories) {
      lines.push(`\n• ${category.name}:`);

      for (const route of category.routes) {
        try {
          const ep = apiRegistry.findEndpoint(route);
          if (!ep) {
            lines.push(`  - route: "${route}"`);
            continue;
          }

          // Build sample required input shape
          const sampleInput: Record<string, string> = {};

          // Query / Path parameters
          for (const p of ep.parameters || []) {
            if (p.required) {
              sampleInput[p.name] = `<${p.schema?.type || 'string'}>`;
            }
          }

          // Request Body parameters
          for (const [propName, schema] of Object.entries(ep.requestBodyProperties || {})) {
            if (ep.requiredBodyProperties?.includes(propName)) {
              const typeStr = schema?.type || (schema?.enum ? `enum(${schema.enum.join('|')})` : 'string');
              sampleInput[propName] = `<${typeStr}>`;
            }
          }

          const summaryComment = ep.summary ? ` // ${ep.summary}` : '';

          // If no required parameters, omit input
          if (Object.keys(sampleInput).length === 0) {
            lines.push(`  - route: "${route}"${summaryComment}`);
          } else {
            const inputJson = JSON.stringify(sampleInput);
            lines.push(`  - route: "${route}", input: ${inputJson}${summaryComment}`);
          }
        } catch {
          // Graceful fallback per route if openapi metadata parsing fails
          lines.push(`  - route: "${route}"`);
        }
      }
    }
  }

  lines.push(`\n--- EXTENSIONS & LONG-TAIL DISCOVERY ---`);
  lines.push(
    `For platform endpoints not listed above (e.g. invite members, workflows, B2B marketplace, media operations), use \`aibl_api_describe({ query: "<topic>" })\` or \`aibl_api_describe({ route: "<route>" })\` to inspect parameter schemas, then invoke via \`aibl_api_call\`.`
  );

  return lines.join('\n');
}
