/**
 * Token pair containing access and refresh tokens
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Function type for getting the current access token
 */
export type TokenGetter = () => string | null;

/**
 * Function type for getting the current refresh token
 * Optional - if not provided, assumes cookie mode
 */
export type RefreshTokenGetter = () => string | null;

/**
 * Function type for storing new tokens after refresh
 */
export type TokenSetter = (tokens: TokenPair) => void;

/**
 * Function type for clearing tokens on auth failure
 */
export type TokenClearer = () => void;

/**
 * Configuration for the refresh endpoint request
 */
export interface RefreshEndpointConfig<TResponse = unknown> {
  /**
   * Full URL to the refresh endpoint
   * @example "https://api.example.com/auth/refresh"
   */
  url: string;

  /**
   * HTTP method for refresh request
   * @default "POST"
   */
  method?: 'POST' | 'PUT';

  /**
   * Credentials mode for fetch (use 'include' for cookie mode)
   * @default "same-origin"
   */
  credentials?: RequestCredentials;

  /**
   * Additional headers to include in refresh request
   */
  headers?: Record<string, string>;

  /**
   * Function to build the request body from the refresh token
   * Not needed in cookie mode
   * @default (token) => JSON.stringify({ refresh_token: token })
   */
  buildBody?: (refreshToken: string) => BodyInit;

  /**
   * Function to extract TokenPair from the response
   * Use generics for full type safety
   */
  parseResponse: (response: TResponse) => TokenPair;
}

/**
 * Configuration for retry behavior on refresh requests
 */
export interface RetryConfig {
  /**
   * Array of delays in milliseconds between retry attempts
   * @default [3000, 6000, 12000] (3 retries, exponential backoff)
   */
  delays?: number[];

  /**
   * Whether to skip retries for client errors (4xx)
   * @default true
   */
  skipOnClientError?: boolean;
}

/**
 * Configuration for cross-tab synchronization
 */
export interface CrossTabConfig {
  /**
   * Enable cross-tab sync via BroadcastChannel
   * @default false
   */
  enabled: boolean;

  /**
   * Channel name for BroadcastChannel
   * @default "ts-retoken-auth"
   */
  channelName?: string;
}

/**
 * Main configuration for createRetoken
 */
export interface RetokenConfig<TResponse = unknown> {
  /**
   * Configuration for the token refresh endpoint
   */
  refreshEndpoint: RefreshEndpointConfig<TResponse>;

  /**
   * Function to get the current access token
   */
  getAccessToken: TokenGetter;

  /**
   * Function to get the current refresh token
   * Optional - if not provided, assumes cookie mode (HTTP-only cookie)
   */
  getRefreshToken?: RefreshTokenGetter;

  /**
   * Function to store new tokens after successful refresh
   */
  setTokens: TokenSetter;

  /**
   * Function to clear tokens on auth failure
   */
  clearTokens: TokenClearer;

  /**
   * Seconds before expiration to consider token "expiring soon"
   * @default 60
   */
  expirationLeeway?: number;

  /**
   * HTTP status codes from original requests that trigger refresh + retry
   * @default [401]
   */
  retryStatuses?: number[];

  /**
   * HTTP status codes from refresh request that mean auth failed completely
   * When refresh returns these, onAuthFailure is called and no more retries
   * @default [401, 403]
   */
  refreshFailureStatuses?: number[];

  /**
   * Retry configuration for refresh requests
   * @default { delays: [3000, 6000, 12000], skipOnClientError: true }
   */
  retry?: RetryConfig;

  /**
   * Cross-tab synchronization configuration
   * @default { enabled: false }
   */
  crossTab?: CrossTabConfig;

  /**
   * Callback invoked when authentication fails completely
   * (refresh token is invalid/expired and all retries exhausted)
   */
  onAuthFailure?: () => void;

  /**
   * Callback invoked when tokens are successfully refreshed
   */
  onTokenRefresh?: (tokens: TokenPair) => void;
}

/**
 * Options for the fetch wrapper
 */
export interface RetokenFetchOptions extends Omit<RequestInit, 'headers'> {
  /**
   * Request headers (will be merged with auth header)
   */
  headers?: Record<string, string>;

  /**
   * Skip proactive token refresh for this request
   * @default false
   */
  skipProactiveRefresh?: boolean;

  /**
   * Skip retry on retryStatuses for this request
   * @default false
   */
  skipRetry?: boolean;
}

/**
 * Options for the fetchJson wrapper
 */
export interface RetokenFetchJsonOptions extends RetokenFetchOptions {
  /**
   * Expected HTTP status codes that indicate success
   * @default [200, 201]
   */
  expectedStatuses?: number[];
}

/**
 * The retoken instance returned by createRetoken
 */
export interface RetokenInstance {
  /**
   * Fetch wrapper that handles token refresh automatically
   * - Proactively refreshes token if expiring soon
   * - Retries with new token on retryStatuses response
   */
  fetch: (url: string, options?: RetokenFetchOptions) => Promise<Response>;

  /**
   * Type-safe fetch wrapper that returns parsed JSON
   * - Handles token refresh automatically
   * - Parses response as JSON with type safety
   * - Throws FetchError on non-success status
   *
   * @example
   * ```typescript
   * interface User { id: string; name: string; }
   * const user = await retoken.fetchJson<User>('/api/users/1');
   * // user is typed as User
   * ```
   */
  fetchJson: <T>(url: string, options?: RetokenFetchJsonOptions) => Promise<T>;

  /**
   * Manually trigger token refresh
   * Returns the existing promise if refresh is already in progress
   */
  refreshToken: () => Promise<TokenPair>;

  /**
   * Check if the current access token is expiring soon
   */
  isTokenExpiringSoon: () => boolean;

  /**
   * Parse expiration timestamp from a JWT token
   * Returns null if token is invalid
   */
  parseTokenExpiration: (token: string) => number | null;

  /**
   * Manually broadcast logout to other tabs (if crossTab enabled)
   */
  broadcastLogout: () => void;

  /**
   * Cleanup resources (BroadcastChannel, etc.)
   * Call this when unmounting/destroying
   */
  destroy: () => void;
}
