# AIBL Author TypeScript SDK (`@op-media-inc/aibl-author-sdk`)

The official TypeScript SDK and client library for interacting with the **AIBL Author Platform**.

Provides strongly typed access to all AIBL Author tRPC and REST procedures, user management, content authoring, workflows, agent executions, and site administration.

---

## 📦 Installation

```bash
npm install @op-media-inc/aibl-author-sdk
```

*(Optional peer dependencies if not already installed: `@trpc/client@^11.0.0` and `superjson@^2.2.1`)*

---

## 🚀 Quick Start

```typescript
import { createAiblClient } from '@op-media-inc/aibl-author-sdk';

// Initialize the client
const client = createAiblClient({
  baseUrl: process.env.AIBL_AUTHOR_URL || 'https://author.example.com',
  getAccessToken: async () => {
    // Return your bearer token (JWT or API key)
    return process.env.AIBL_AUTHOR_API_TOKEN;
  },
});

async function main() {
  // 1. Fetch current identity
  const me = await client.iam.me.query();
  console.log(`Authenticated as ${me.name} (${me.email})`);

  // 2. List organizations
  const orgs = await client.organizations.getMyOrganizations.query();
  console.log(`Organizations (${orgs.length}):`, orgs.map(o => o.name));

  // 3. List posts for a site
  const posts = await client.post.listBySite.query({ siteId: 'my-site-id' });
  console.log(`Posts count: ${posts.length}`);
}

main().catch(console.error);
```

---

## 🛡️ Strongly Typed Contract Types

All tRPC inputs, outputs, and array items are exported as standalone TypeScript types for easy typing of frontend components, handlers, and state management:

```typescript
import {
  type PostGetOutput,
  type PostCreateInput,
  type AgentListItem,
  type OrganizationsGetMyOrganizationsOutput,
} from '@op-media-inc/aibl-author-sdk';

function handlePost(post: PostGetOutput) {
  console.log(post.title, post.status);
}
```

---

## ⚙️ Configuration Options

| Option | Type | Description |
| :--- | :--- | :--- |
| `baseUrl` | `string` | **Required.** The root URL of the AIBL Author instance (e.g., `https://author.example.com` or `http://localhost:3000`). |
| `getAccessToken` | `() => Promise<string \| null> \| string \| null` | Optional callback returning the Bearer token for authenticated requests. |
| `headers` | `Record<string, string> \| (() => Promise<Record<string, string>>)` | Optional additional HTTP headers to attach to every request. |
| `fetch` | `typeof fetch` | Optional custom `fetch` implementation (useful in test or Cloudflare Workers environments). |

---

## 🌐 OpenAPI Specification (REST / Polyglot Integration)

For developers using **C# / .NET**, **Python**, **Go**, or standard REST integrations, the complete OpenAPI v3 specification covering all 150+ platform endpoints is bundled:
* **In this package**: [`./openapi.json`](./openapi.json)
* **GitHub Releases**: Download `openapi.json` directly from the [GitHub Releases](https://github.com/OPMediaInc/aibl-author-sdk/releases) tab.

---

## 📄 License

ISC © [OP Media Inc.](https://opmedia.com)
