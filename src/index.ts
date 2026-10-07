// ============================================================================
// AIBL AUTHOR OFFICIAL TYPESCRIPT SDK
// ============================================================================

// Client Factory & Options
export {
  createAiblClient,
  type AiblClient,
  type AiblClientOptions,
} from './client';

// Auto-generated API Contract Types (RouterInputs, RouterOutputs, granular procedure types)
export * from './types';

// Export root router type for advanced custom client usage
export type { AppRouter } from '@aibl-author/api';
