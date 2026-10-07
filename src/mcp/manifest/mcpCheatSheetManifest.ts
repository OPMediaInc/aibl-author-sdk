import type { AppRouter } from '../../index.js';

/**
 * Derives strongly-typed dot-notation procedure paths from AppRouter.
 * e.g. "organizations.getMyOrganizations" | "iam.me" | "site.getBySlugOrId" | "agent.install.list"
 */
type ProcedureKeys<TRouter> = {
  [K in keyof TRouter & string]: TRouter[K] extends { _def: any }
    ? K
    : TRouter[K] extends Record<string, any>
    ? `${K}.${ProcedureKeys<TRouter[K]>}`
    : never;
}[keyof TRouter & string];

export type AiblApiRoute = ProcedureKeys<AppRouter>;

export interface CheatSheetCategory {
  name: string;
  routes: AiblApiRoute[];
}

export interface CheatSheetSection {
  title: string;
  description?: string;
  categories: CheatSheetCategory[];
}

export const MCP_CHEAT_SHEET_MANIFEST: CheatSheetSection[] = [
  {
    title: 'AUTHENTICATED / PROTECTED (Requires Login)',
    description: 'Use for user-specific data, authoring, management, and mutations.',
    categories: [
      {
        name: 'Identity & Permissions',
        routes: ['iam.me'],
      },
      {
        name: 'Organizations',
        routes: ['organizations.getMyOrganizations', 'organizations.getOrganizationBySlugOrId'],
      },
      {
        name: 'Cores / Sites',
        routes: ['site.listAccessible', 'site.listByOrganization', 'site.getBySlugOrId'],
      },
      {
        name: 'Posts & Drafts',
        routes: ['post.listBySite', 'post.get', 'post.createDraft', 'post.delete', 'post.discardDraft'],
      },
      {
        name: 'Taxonomy',
        routes: ['taxonomy.upsertCategory', 'taxonomy.upsertTag', 'taxonomy.deleteCategory', 'taxonomy.deleteTag'],
      },
      {
        name: 'AI Agents',
        routes: ['agent.listAccessible', 'agent.listByOrganization', 'agent.listBySite', 'agent.get'],
      },
    ],
  },
  {
    title: 'PUBLIC / GUEST (No Login Required)',
    description: 'Use when unauthenticated or querying public reader content.',
    categories: [
      {
        name: 'Reader Access',
        routes: [
          'organizations.listReaderOrganizations',
          'organizations.getReaderOrganization',
          'site.getReaderData',
          'post.listReaderPosts',
          'post.getReaderData',
        ],
      },
      {
        name: 'Discovery',
        routes: ['search.global'],
      },
    ],
  },
];
