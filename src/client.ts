import {
  createTRPCClient,
  httpBatchLink,
  type HTTPHeaders,
} from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@aibl-author/api';

export interface AiblClientOptions {
  /**
   * Base URL of the AIBL Author instance.
   * e.g. "https://author.example.com" or "http://localhost:3000"
   */
  baseUrl: string;

  /**
   * Function or static string providing the Bearer access token for authentication.
   */
  getAccessToken?: () => Promise<string | null | undefined> | string | null | undefined;

  /**
   * Additional static or dynamic HTTP headers to send with requests.
   */
  headers?: HTTPHeaders | (() => Promise<HTTPHeaders> | HTTPHeaders);

  /**
   * Optional custom fetch implementation (useful in test or edge runtime environments).
   */
  fetch?: typeof fetch;
}

/**
 * Strongly typed AIBL Author tRPC Client Type
 */
export type AiblClient = ReturnType<typeof createTRPCClient<AppRouter>>;

/**
 * Creates a strongly typed AIBL Author tRPC client.
 *
 * @example
 * ```typescript
 * import { createAiblClient } from '@op-media-inc/aibl-author-sdk';
 *
 * const client = createAiblClient({
 *   baseUrl: 'https://author.example.com',
 *   getAccessToken: () => 'my-jwt-access-token',
 * });
 *
 * const me = await client.iam.me.query();
 * console.log('Authenticated as:', me.name);
 * ```
 */
export function createAiblClient(options: AiblClientOptions): AiblClient {
  const normalizedBaseUrl = options.baseUrl.replace(/\/+$/, '');
  const trpcUrl = normalizedBaseUrl.endsWith('/api/trpc')
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/api/trpc`;

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: trpcUrl,
        transformer: superjson,
        fetch: options.fetch,
        headers: async () => {
          const resolvedHeaders: Record<string, string> = {};

          if (options.headers) {
            const extra = typeof options.headers === 'function'
              ? await options.headers()
              : options.headers;
            Object.assign(resolvedHeaders, extra);
          }

          if (options.getAccessToken) {
            const token = await options.getAccessToken();
            if (token) {
              resolvedHeaders['Authorization'] = `Bearer ${token}`;
            }
          }

          return resolvedHeaders;
        },
      }),
    ],
  });
}
