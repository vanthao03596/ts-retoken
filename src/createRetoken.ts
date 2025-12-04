import type {
  RetokenConfig,
  RetokenInstance,
  RetokenFetchOptions,
  RetokenFetchJsonOptions,
  TokenPair,
} from './types';
import { isTokenExpiringSoon, parseTokenExpiration } from './jwt';
import { createCrossTabSync } from './crossTab';
import type { CrossTabSync } from './crossTab';
import { createRefresher, FetchError } from './refresher';

/**
 * Default configuration values
 */
const DEFAULTS: {
  expirationLeeway: number;
  retryStatuses: number[];
  refreshFailureStatuses: number[];
  retryDelays: number[];
  skipOnClientError: boolean;
  crossTabChannelName: string;
} = {
  expirationLeeway: 60,
  retryStatuses: [401],
  refreshFailureStatuses: [401, 403],
  retryDelays: [3000, 6000, 12000],
  skipOnClientError: true,
  crossTabChannelName: 'ts-retoken-auth',
};

/**
 * Create a configured retoken instance for managing token refresh
 *
 * @param config - Configuration options
 * @returns RetokenInstance with fetch wrapper and utilities
 *
 * @example
 * ```typescript
 * // localStorage mode
 * const retoken = createRetoken({
 *   refreshEndpoint: {
 *     url: '/api/auth/refresh',
 *     parseResponse: (data) => ({
 *       accessToken: data.access_token,
 *       refreshToken: data.refresh_token,
 *     }),
 *   },
 *   getAccessToken: () => localStorage.getItem('access_token'),
 *   getRefreshToken: () => localStorage.getItem('refresh_token'),
 *   setTokens: (tokens) => {
 *     localStorage.setItem('access_token', tokens.accessToken);
 *     localStorage.setItem('refresh_token', tokens.refreshToken);
 *   },
 *   clearTokens: () => localStorage.clear(),
 * });
 *
 * // Use the fetch wrapper
 * const response = await retoken.fetch('/api/users/me');
 * ```
 */
export function createRetoken<TResponse = unknown>(
  config: RetokenConfig<TResponse>
): RetokenInstance {
  // Destructure config with defaults
  const {
    refreshEndpoint,
    getAccessToken,
    getRefreshToken,
    setTokens,
    clearTokens,
    expirationLeeway = DEFAULTS.expirationLeeway,
    retryStatuses = DEFAULTS.retryStatuses,
    refreshFailureStatuses = DEFAULTS.refreshFailureStatuses,
    retry = {},
    crossTab = { enabled: false },
    onAuthFailure,
    onTokenRefresh,
  } = config;

  // Merge retry config with defaults
  const retryDelays = retry.delays ?? DEFAULTS.retryDelays;
  const skipOnClientError = retry.skipOnClientError ?? DEFAULTS.skipOnClientError;

  // Initialize cross-tab sync if enabled
  let crossTabSync: CrossTabSync | null = null;
  if (crossTab.enabled) {
    crossTabSync = createCrossTabSync({
      channelName: crossTab.channelName ?? DEFAULTS.crossTabChannelName,
      onLogoutReceived: () => {
        clearTokens();
        onAuthFailure?.();
      },
    });
  }

  // Create the refresher with deduplication
  const refresher = createRefresher<TResponse>({
    refreshEndpoint,
    getRefreshToken,
    setTokens,
    clearTokens,
    retryDelays,
    skipOnClientError,
    refreshFailureStatuses,
    onAuthFailure: () => {
      crossTabSync?.broadcastLogout();
      onAuthFailure?.();
    },
    onTokenRefresh,
  });

  // Check if current token is expiring soon
  const checkTokenExpiringSoon = (): boolean => {
    const token = getAccessToken();
    return isTokenExpiringSoon(token, expirationLeeway);
  };

  // Build headers with current token
  const buildHeaders = (customHeaders: Record<string, string> = {}): Headers => {
    const headers = new Headers(customHeaders);
    const token = getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  };

  // Fetch wrapper with automatic token refresh
  const wrappedFetch = async (
    url: string,
    options: RetokenFetchOptions = {}
  ): Promise<Response> => {
    const {
      skipProactiveRefresh = false,
      skipRetry = false,
      headers = {},
      ...fetchOptions
    } = options;

    // Proactive refresh if token is expiring soon
    if (!skipProactiveRefresh && checkTokenExpiringSoon()) {
      try {
        await refresher.refresh();
      } catch {
        // If proactive refresh fails, still try the request
        // It might succeed if the token isn't actually expired yet
      }
    }

    // Make the request
    const response = await fetch(url, {
      ...fetchOptions,
      headers: buildHeaders(headers),
    });

    // Check if we should retry with refresh
    if (!skipRetry && retryStatuses.includes(response.status)) {
      try {
        await refresher.refresh();
        // Retry with new token
        return fetch(url, {
          ...fetchOptions,
          headers: buildHeaders(headers),
        });
      } catch {
        // Refresh failed, return original response
        return response;
      }
    }

    return response;
  };

  // Type-safe fetch wrapper that returns parsed JSON
  const wrappedFetchJson = async <T>(
    url: string,
    options: RetokenFetchJsonOptions = {}
  ): Promise<T> => {
    const { expectedStatuses = [200, 201], ...fetchOptions } = options;

    const response = await wrappedFetch(url, fetchOptions);

    // Check if status is expected
    if (!expectedStatuses.includes(response.status)) {
      let errorBody: unknown = null;
      try {
        errorBody = await response.json();
      } catch {
        // Response body is not JSON
      }
      throw new FetchError(
        `Request failed with status ${response.status}`,
        response.status,
        errorBody
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    return response.json() as Promise<T>;
  };

  // Return the retoken instance
  return {
    fetch: wrappedFetch,
    fetchJson: wrappedFetchJson,
    refreshToken: (): Promise<TokenPair> => refresher.refresh(),
    isTokenExpiringSoon: checkTokenExpiringSoon,
    parseTokenExpiration,
    broadcastLogout: () => crossTabSync?.broadcastLogout(),
    destroy: () => crossTabSync?.destroy(),
  };
}
