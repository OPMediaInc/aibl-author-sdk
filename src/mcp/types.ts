import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppRouter } from '../index';

export interface ILogger {
  debug?: (msg: string, ...args: any[]) => void;
  info?: (msg: string, ...args: any[]) => void;
  warn?: (msg: string, ...args: any[]) => void;
  error?: (msg: string, ...args: any[]) => void;
}

export interface McpServerContext {
  /**
   * Either a tRPC client (CLI remote over HTTP) or an in-memory tRPC caller (Web SSE / server).
   */
  client: any;
  baseUrl: string;
  apiRegistry: any;
  logger?: ILogger;
  /**
   * Optional context metadata (e.g. CLI context config or server metadata).
   */
  context?: {
    url?: string;
    [key: string]: any;
  };
}

export interface CreateAiblMcpServerOptions {
  /**
   * Either an instantiated tRPC client or in-memory tRPC caller (e.g. createCaller(ctx)).
   */
  clientOrCaller: any;
  baseUrl?: string;
  serverName?: string;
  serverVersion?: string;
  apiRegistry?: any;
  openApiDoc?: any;
  allTools?: boolean;
  tools?: string;
  logger?: ILogger;
  context?: {
    url?: string;
    [key: string]: any;
  };
}
