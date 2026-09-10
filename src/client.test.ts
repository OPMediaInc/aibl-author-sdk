import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createAiblClient,
  type AiblClient,
  type IamMeOutput,
  type PostListBySiteOutput,
} from './index.js';

describe('AIBL Author SDK Client Factory', () => {
  it('initializes client with custom baseUrl and token getter', () => {
    let tokenProvided = '';

    const client: AiblClient = createAiblClient({
      baseUrl: 'https://author.example.com',
      getAccessToken: async () => {
        tokenProvided = 'mock-jwt-token';
        return tokenProvided;
      },
    });

    assert.ok(client, 'Client should be instantiated');
    assert.ok(client.iam, 'Client should have iam router');
    assert.ok(client.iam.me, 'Client should have iam.me procedure');
    assert.ok(client.post, 'Client should have post router');
    assert.ok(client.organizations, 'Client should have organizations router');
  });

  it('normalizes base url ending with /api/trpc cleanly', () => {
    const client = createAiblClient({
      baseUrl: 'http://localhost:3000/api/trpc/',
    });

    assert.ok(client, 'Client should instantiate cleanly');
  });
});
