// Main factory function
export { createRetoken } from './createRetoken';

// Error classes
export { RefreshError, FetchError } from './refresher';

// JWT utilities (standalone usage)
export { isTokenExpiringSoon, parseTokenExpiration } from './jwt';

// Types - all exported for consumers
export type {
  // Config types
  RetokenConfig,
  RefreshEndpointConfig,
  RetryConfig,
  CrossTabConfig,
  RetokenFetchOptions,
  RetokenFetchJsonOptions,

  // Token types
  TokenPair,
  TokenGetter,
  RefreshTokenGetter,
  TokenSetter,
  TokenClearer,

  // Instance type
  RetokenInstance,
} from './types';
