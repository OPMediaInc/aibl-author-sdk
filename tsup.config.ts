import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/mcp/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    resolve: ['@aibl-author/api'],
  },
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['@trpc/client', '@trpc/server', 'superjson', '@modelcontextprotocol/sdk'],
});
