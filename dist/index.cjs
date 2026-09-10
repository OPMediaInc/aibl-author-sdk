'use strict';

var client = require('@trpc/client');
var superjson = require('superjson');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var superjson__default = /*#__PURE__*/_interopDefault(superjson);

// src/client.ts
function createAiblClient(options) {
  const normalizedBaseUrl = options.baseUrl.replace(/\/+$/, "");
  const trpcUrl = normalizedBaseUrl.endsWith("/api/trpc") ? normalizedBaseUrl : `${normalizedBaseUrl}/api/trpc`;
  return client.createTRPCClient({
    links: [
      client.httpBatchLink({
        url: trpcUrl,
        transformer: superjson__default.default,
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

exports.createAiblClient = createAiblClient;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map