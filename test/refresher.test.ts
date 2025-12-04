import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRefresher, RefreshError, FetchError } from '../src/refresher';
import {
  createMockFetch,
  createSequentialMockFetch,
  setupFetchMock,
  createRefreshResponse,
} from './helpers/mockFetch';
import { createValidToken } from './helpers/tokens';

describe('RefreshError', () => {
  it('should create error with message and status', () => {
    const error = new RefreshError('Refresh failed', 401);
    expect(error.message).toBe('Refresh failed');
    expect(error.status).toBe(401);
    expect(error.name).toBe('RefreshError');
  });

  it('should be instanceof Error', () => {
    const error = new RefreshError('Test', 500);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('FetchError', () => {
  it('should create error with message, status, and body', () => {
    const body = { error: 'Not found' };
    const error = new FetchError('Request failed', 404, body);
    expect(error.message).toBe('Request failed');
    expect(error.status).toBe(404);
    expect(error.body).toEqual(body);
    expect(error.name).toBe('FetchError');
  });

  it('should default body to null', () => {
    const error = new FetchError('Request failed', 500);
    expect(error.body).toBeNull();
  });
});

describe('createRefresher', () => {
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup?.();
  });

  const createTestRefresher = (
    mockFetch: ReturnType<typeof vi.fn>,
    options: {
      getRefreshToken?: () => string | null;
      retryDelays?: number[];
      skipOnClientError?: boolean;
      refreshFailureStatuses?: number[];
      onAuthFailure?: () => void;
      onTokenRefresh?: (tokens: { accessToken: string; refreshToken: string }) => void;
    } = {}
  ) => {
    cleanup = setupFetchMock(mockFetch);

    const setTokens = vi.fn();
    const clearTokens = vi.fn();
    const onAuthFailure = options.onAuthFailure ?? vi.fn();
    const onTokenRefresh = options.onTokenRefresh ?? vi.fn();

    const refresher = createRefresher({
      refreshEndpoint: {
        url: '/api/refresh',
        parseResponse: (data: { access_token: string; refresh_token: string }) => ({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        }),
      },
      getRefreshToken: options.getRefreshToken,
      setTokens,
      clearTokens,
      retryDelays: options.retryDelays ?? [100, 200],
      skipOnClientError: options.skipOnClientError ?? true,
      refreshFailureStatuses: options.refreshFailureStatuses ?? [401, 403],
      onAuthFailure,
      onTokenRefresh,
    });

    return { refresher, setTokens, clearTokens, onAuthFailure, onTokenRefresh };
  };

  describe('successful refresh', () => {
    it('should refresh tokens successfully', async () => {
      const accessToken = createValidToken();
      const refreshToken = createValidToken();
      const mockFetch = createMockFetch(createRefreshResponse(accessToken, refreshToken));

      const { refresher, setTokens, onTokenRefresh } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'old-refresh-token',
      });

      const result = await refresher.refresh();

      expect(result).toEqual({ accessToken, refreshToken });
      expect(setTokens).toHaveBeenCalledWith({ accessToken, refreshToken });
      expect(onTokenRefresh).toHaveBeenCalledWith({ accessToken, refreshToken });
    });

    it('should send refresh token in request body (localStorage mode)', async () => {
      const mockFetch = createMockFetch(createRefreshResponse('new-access', 'new-refresh'));

      const { refresher } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'my-refresh-token',
      });

      await refresher.refresh();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/refresh',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refresh_token: 'my-refresh-token' }),
        })
      );
    });

    it('should not send body in cookie mode (no getRefreshToken)', async () => {
      const mockFetch = createMockFetch(createRefreshResponse('new-access', 'new-refresh'));

      const { refresher } = createTestRefresher(mockFetch);

      await refresher.refresh();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/refresh',
        expect.objectContaining({
          method: 'POST',
        })
      );
      const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
      expect(callArgs.body).toBeUndefined();
    });
  });

  describe('request deduplication', () => {
    it('should deduplicate concurrent refresh calls', async () => {
      const mockFetch = createMockFetch(createRefreshResponse('access', 'refresh'));

      const { refresher } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'token',
      });

      // Start multiple refreshes concurrently
      const promise1 = refresher.refresh();
      const promise2 = refresher.refresh();
      const promise3 = refresher.refresh();

      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      // All should return the same result
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);

      // But fetch should only be called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should allow new refresh after previous completes', async () => {
      const mockFetch = createMockFetch(createRefreshResponse('access', 'refresh'));

      const { refresher } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'token',
      });

      await refresher.refresh();
      await refresher.refresh();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry logic', () => {
    it('should retry on server error (5xx)', async () => {
      const mockFetch = createSequentialMockFetch([
        { status: 500, ok: false },
        { status: 500, ok: false },
        createRefreshResponse('access', 'refresh'),
      ]);

      const { refresher } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'token',
        retryDelays: [100, 200],
      });

      const refreshPromise = refresher.refresh();

      // First call fails immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Wait for first retry delay
      await vi.advanceTimersByTimeAsync(100);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Wait for second retry delay
      await vi.advanceTimersByTimeAsync(200);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      const result = await refreshPromise;
      expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('should skip retry on client error (4xx) when skipOnClientError is true', async () => {
      const mockFetch = createMockFetch({ status: 400, ok: false });

      const { refresher, clearTokens, onAuthFailure } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'token',
        skipOnClientError: true,
        refreshFailureStatuses: [401, 403], // 400 is not in this list
      });

      await expect(refresher.refresh()).rejects.toThrow(RefreshError);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
      expect(clearTokens).toHaveBeenCalled();
      expect(onAuthFailure).toHaveBeenCalled();
    });

    it('should retry on client error when skipOnClientError is false', async () => {
      const mockFetch = createSequentialMockFetch([
        { status: 400, ok: false },
        createRefreshResponse('access', 'refresh'),
      ]);

      const { refresher } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'token',
        skipOnClientError: false,
        retryDelays: [100],
        refreshFailureStatuses: [401, 403], // 400 is not auth failure
      });

      const refreshPromise = refresher.refresh();

      await vi.advanceTimersByTimeAsync(100);

      const result = await refreshPromise;
      expect(result).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on auth failure status', async () => {
      const mockFetch = createMockFetch({ status: 401, ok: false });

      const { refresher, clearTokens, onAuthFailure } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'token',
        refreshFailureStatuses: [401, 403],
      });

      await expect(refresher.refresh()).rejects.toThrow(RefreshError);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries for auth failure
      expect(clearTokens).toHaveBeenCalled();
      expect(onAuthFailure).toHaveBeenCalled();
    });

    it('should exhaust retries and fail', async () => {
      const mockFetch = createMockFetch({ status: 500, ok: false });

      const { refresher, clearTokens, onAuthFailure } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'token',
        retryDelays: [100, 200],
      });

      const refreshPromise = refresher.refresh();

      // Attach error handler to prevent unhandled rejection
      refreshPromise.catch(() => {
        // Intentionally empty - just prevents unhandled rejection
      });

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(0);

      await expect(refreshPromise).rejects.toThrow(RefreshError);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(clearTokens).toHaveBeenCalled();
      expect(onAuthFailure).toHaveBeenCalled();
    });
  });

  describe('auth failure handling', () => {
    it('should clear tokens and call onAuthFailure on auth failure', async () => {
      const mockFetch = createMockFetch({ status: 403, ok: false });
      const onAuthFailure = vi.fn();

      const { refresher, clearTokens } = createTestRefresher(mockFetch, {
        getRefreshToken: () => 'token',
        onAuthFailure,
      });

      await expect(refresher.refresh()).rejects.toThrow(RefreshError);
      expect(clearTokens).toHaveBeenCalled();
      expect(onAuthFailure).toHaveBeenCalled();
    });

    it('should fail immediately when no refresh token in localStorage mode', async () => {
      const mockFetch = createMockFetch(createRefreshResponse('access', 'refresh'));
      const onAuthFailure = vi.fn();

      const { refresher, clearTokens } = createTestRefresher(mockFetch, {
        getRefreshToken: () => null, // No refresh token
        onAuthFailure,
      });

      await expect(refresher.refresh()).rejects.toThrow('No refresh token available');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(clearTokens).toHaveBeenCalled();
      expect(onAuthFailure).toHaveBeenCalled();
    });
  });
});
