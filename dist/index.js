import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

// src/client.ts
function createAiblClient(options) {
  const normalizedBaseUrl = options.baseUrl.replace(/\/+$/, "");
  const trpcUrl = normalizedBaseUrl.endsWith("/api/trpc") ? normalizedBaseUrl : `${normalizedBaseUrl}/api/trpc`;
  return createTRPCClient({
    links: [
      httpBatchLink({
        url: trpcUrl,
        transformer: superjson,
        fetch: options.fetch,
        headers: async () => {
          const resolvedHeaders = {};
          if (options.headers) {
            const extra = typeof options.headers === "function" ? await options.headers() : options.headers;
            Object.assign(resolvedHeaders, extra);
          }
          if (options.getAccessToken) {
            const token = await options.getAccessToken();
            if (token) {
              resolvedHeaders["Authorization"] = `Bearer ${token}`;
            }
          }
          return resolvedHeaders;
        }
      })
    ]
  });
}

export { createAiblClient };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map