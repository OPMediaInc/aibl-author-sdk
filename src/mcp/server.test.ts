import assert from 'node:assert';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createAiblMcpServer } from './server';
import { ApiRegistryService } from './api/ApiRegistryService';

console.log('Testing SDK createAiblMcpServer...');

const mockClient = {
  iam: {
    me: async () => ({
      user: { id: 'test-user-id', name: 'Test User' },
    }),
  },
};

const apiRegistry = new ApiRegistryService();
const server = createAiblMcpServer({
  clientOrCaller: mockClient,
  baseUrl: 'https://demo.aiblx.ai',
  serverName: 'aibl-author-test',
  serverVersion: '1.0.0',
  apiRegistry,
});

assert.ok(server, 'McpServer should be instantiated');

// Connect in-memory client
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

await Promise.all([
  server.connect(serverTransport),
  client.connect(clientTransport),
]);

// 1. Verify instructions
const instructions = client.getInstructions();
assert.ok(instructions, 'Instructions should be present');
assert.ok(instructions.includes('Dual URL Standards'), 'Instructions must include Dual URL Standards');
assert.ok(instructions.includes('https://demo.aiblx.ai'), 'Instructions must include base URL');
assert.ok(instructions.includes('API Route Cheat Sheet'), 'Instructions must include cheat sheet');

// 2. Verify tools
const tools = await client.listTools();
const toolNames = tools.tools.map((t) => t.name);
assert.strictEqual(toolNames.length, 2, 'Should register exactly 2 universal tools by default');
assert.ok(toolNames.includes('aibl_api_describe'), 'Should include aibl_api_describe');
assert.ok(toolNames.includes('aibl_api_call'), 'Should include aibl_api_call');

// 3. Test aibl_api_describe
const descResult = await client.callTool({
  name: 'aibl_api_describe',
  arguments: { route: 'iam.me' },
});
const descData = JSON.parse((descResult.content as any)[0].text);
assert.strictEqual(descData.route, 'iam.me');
assert.strictEqual(descData.procedureType, 'query');

// 4. Test aibl_api_call with mock
const callResult = await client.callTool({
  name: 'aibl_api_call',
  arguments: { route: 'iam.me' },
});
const callData = JSON.parse((callResult.content as any)[0].text);
assert.strictEqual(callData.user.id, 'test-user-id');

await client.close();

// 5. Test real tRPC in-memory createCaller proxy dispatching
console.log('Testing in-memory tRPC createCaller with createAiblMcpServer...');
const { initTRPC } = await import('@trpc/server');
const t = initTRPC.create();
const testRouter = t.router({
  iam: t.router({
    me: t.procedure.query(() => ({
      user: { id: 'caller-user-id', name: 'Caller User' },
    })),
  }),
  media: t.router({
    rename: t.procedure.input((await import('zod')).z.any()).mutation(({ input }: any) => ({
      success: true,
      newName: input?.name,
    })),
  }),
});

const trpcCaller = testRouter.createCaller({});

const callerServer = createAiblMcpServer({
  clientOrCaller: trpcCaller,
  baseUrl: 'https://demo.aiblx.ai',
  openApiDoc: {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/iam/me': {
        get: {
          operationId: 'iam-me',
          summary: 'Get current user profile',
          responses: { '200': { description: 'Success' } },
        },
      },
      '/media/rename': {
        post: {
          operationId: 'media-rename',
          summary: 'Rename media asset',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { name: { type: 'string' } },
                  required: ['name'],
                },
              },
            },
          },
          responses: { '200': { description: 'Success' } },
        },
      },
    },
  },
});

const [callerClientTransport, callerServerTransport] = InMemoryTransport.createLinkedPair();
const callerClient = new Client({ name: 'caller-test-client', version: '1.0.0' }, { capabilities: {} });

await Promise.all([
  callerServer.connect(callerServerTransport),
  callerClient.connect(callerClientTransport),
]);

// 5a. Verify aibl_api_describe works with custom in-memory openApiDoc
const describeResult = await callerClient.callTool({
  name: 'aibl_api_describe',
  arguments: { router: 'iam' },
});
const describeData = JSON.parse((describeResult.content as any)[0].text);
assert.strictEqual(describeData.router, 'iam');
assert.strictEqual(describeData.procedureCount, 1);
assert.strictEqual(describeData.procedures[0].route, 'iam.me');

// 5b. Verify aibl_api_call executes in-memory query without "iam,me,query" error
const callerQueryCall = await callerClient.callTool({
  name: 'aibl_api_call',
  arguments: { route: 'iam.me' },
});
const callerQueryData = JSON.parse((callerQueryCall.content as any)[0].text);
assert.strictEqual(callerQueryData.user.id, 'caller-user-id');

// 5c. Verify aibl_api_call executes in-memory mutation directly
const callerMutateCall = await callerClient.callTool({
  name: 'aibl_api_call',
  arguments: { route: 'media.rename', input: { name: 'new-logo.png' } },
});
const callerMutateData = JSON.parse((callerMutateCall.content as any)[0].text);
assert.strictEqual(callerMutateData.success, true);
assert.strictEqual(callerMutateData.newName, 'new-logo.png');

await callerClient.close();

console.log('✅ SDK createAiblMcpServer tests passed successfully!');
