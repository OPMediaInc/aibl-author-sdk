import assert from 'node:assert';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createAiblMcpServer } from './server.js';
import { ApiRegistryService } from './api/ApiRegistryService.js';

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
console.log('✅ SDK createAiblMcpServer tests passed successfully!');
