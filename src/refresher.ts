import type {
  RefreshEndpointConfig,
  RefreshTokenGetter,
  TokenSetter,
  TokenClearer,
  TokenPair,
} from './types';

/**
 * Configuration for the refresher
 */
interface RefresherConfig<TResponse = unknown> {
  refreshEndpoint: RefreshEndpointConfig<TResponse>;
  getRefreshToken?: RefreshTokenGetter;
  setTokens: TokenSetter;
  clearTokens: TokenClearer;
  retryDelays: number[];
  skipOnClientError: boolean;
  refreshFailureStatuses: number[];
  onAuthFailure?: () => void;
  onTokenRefresh?: (tokens: TokenPair) => void;
}

/**
 * Refresher instance with refresh method
 */
export interface Refresher {
  refresh: () => Promise<TokenPair>;
}

/**
 * Custom error for refresh failures
 * Includes HTTP status code for error handling
 */
export class RefreshError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RefreshError';
    this.status = status;
  }
}

/**
 * Custom error for fetch failures
 * Includes HTTP status code and response body for error handling
 */
export class FetchError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a refresher instance with deduplication and retry logic
 *
 * @param config - Refresher configuration
 * @returns Refresher instance
 */
export function createRefresher<TResponse = unknown>(
  config: RefresherConfig<TResponse>
): Refresher {
  const {
    refreshEndpoint,
    getRefreshToken,
    setTokens,
    clearTokens,
    retryDelays,
    skipOnClientError,
    refreshFailureStatuses,
    onAuthFailure,
    onTokenRefresh,
  } = config;

  // Request deduplication - only one refresh at a time
  let refreshPromise: Promise<TokenPair> | null = null;

  // Check if a status code indicates auth failure
  const isAuthFailureStatus = (status: number): boolean => {
    return refreshFailureStatuses.includes(status);
  };

  // Default body builder for localStorage mode
  const defaultBuildBody = (token: string): string => {
    return JSON.stringify({ refresh_token: token });
  };

  // Perform single refresh request
  const performRefresh = async (refreshToken?: string): Promise<TokenPair> => {
    const {
      url,
      method = 'POST',
      credentials = 'same-origin',
      headers = {},
      buildBody = defaultBuildBody,
      parseResponse,
    } = refreshEndpoint;

    // Build request options
    const fetchOptions: RequestInit = {
      method,
      credentials,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    // Add body only if we have a refresh token (localStorage mode)
    if (refreshToken) {
      fetchOptions.body = buildBody(refreshToken);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new RefreshError(`Refresh failed: ${response.status}`, response.status);
    }

    const data = (await response.json()) as TResponse;
    return parseResponse(data);
  };

  // Perform refresh with retry logic
  const performRefreshWithRetry = async (
    refreshToken?: string
  ): Promise<TokenPair> => {
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        return await performRefresh(refreshToken);
      } catch (error) {
        // Check if this is an auth failure (don't retry)
        if (error instanceof RefreshError && isAuthFailureStatus(error.status)) {
          throw error;
        }

        // Check if this is a client error (don't retry if configured)
        const isClientError =
          error instanceof RefreshError &&
          error.status >= 400 &&
          error.status < 500;

        if ((skipOnClientError && isClientError) || attempt === retryDelays.length) {
          throw error;
        }

        // Wait before retry
        await sleep(retryDelays[attempt]);
      }
    }

    throw new RefreshError('Refresh failed after retries', 0);
  };

  // Handle auth failure - clear tokens and notify
  const handleAuthFailure = (): void => {
    clearTokens();
    onAuthFailure?.();
  };

  // Main refresh function with deduplication
  const refresh = async (): Promise<TokenPair> => {
    // If already refreshing, return existing promise (deduplication)
    if (refreshPromise) {
      return refreshPromise;
    }

    // Get refresh token if in localStorage mode
    const refreshToken = getRefreshToken?.();

    // In localStorage mode, check if refresh token exists
    if (getRefreshToken && !refreshToken) {
      handleAuthFailure();
      throw new RefreshError('No refresh token available', 0);
    }

    // Create the refresh promise
    refreshPromise = performRefreshWithRetry(refreshToken ?? undefined)
      .then((tokens) => {
        setTokens(tokens);
        onTokenRefresh?.(tokens);
        return tokens;
      })
      .catch((error) => {
        handleAuthFailure();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  };

  return { refresh };
}
