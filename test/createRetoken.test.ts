import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRetoken } from '../src/createRetoken';
import { FetchError } from '../src/refresher';
import {
  createMockFetch,
  createSequentialMockFetch,
  setupFetchMock,
  createRefreshResponse,
} from './helpers/mockFetch';
import { createValidToken, createSoonExpiringToken, createToken } from './helpers/tokens';

describe('createRetoken', () => {
  let cleanup: () => void;
  let tokenStore: { accessToken: string | null; refreshToken: string | null };

  const createTestRetoken = (
    mockFetch: ReturnType<typeof vi.fn>,
    options: {
      accessToken?: string | null;
      refreshToken?: string | null;
      expirationLeeway?: number;
      retryStatuses?: number[];
      crossTabEnabled?: boolean;
      onAuthFailure?: () => void;
      onTokenRefresh?: (tokens: { accessToken: string; refreshToken: string }) => void;
    } = {}
  ) => {
    cleanup = setupFetchMock(mockFetch);

    tokenStore = {
      accessToken: 'accessToken' in options ? (options.accessToken ?? null) : createValidToken(),
      refreshToken: 'refreshToken' in options ? (options.refreshToken ?? null) : createValidToken(),
    };

    const onAuthFailure = options.onAuthFailure ?? vi.fn();
    const onTokenRefresh = options.onTokenRefresh ?? vi.fn();

    const retoken = createRetoken<{ access_token: string; refresh_token: string }>({
      refreshEndpoint: {
        url: '/api/refresh',
        parseResponse: (data) => ({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        }),
      },
      getAccessToken: () => tokenStore.accessToken,
      getRefreshToken: () => tokenStore.refreshToken,
      setTokens: (tokens) => {
        tokenStore.accessToken = tokens.accessToken;
        tokenStore.refreshToken = tokens.refreshToken;
      },
      clearTokens: () => {
        tokenStore.accessToken = null;
        tokenStore.refreshToken = null;
      },
      expirationLeeway: options.expirationLeeway ?? 60,
      retryStatuses: options.retryStatuses ?? [401],
      crossTab: { enabled: options.crossTabEnabled ?? false },
      onAuthFailure,
      onTokenRefresh,
    });

    return { retoken, onAuthFailure, onTokenRefresh };
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup?.();
  });

  describe('fetch wrapper', () => {
    it('should add Authorization header to requests', async () => {
      const accessToken = createValidToken();
      const mockFetch = createMockFetch({ status: 200, body: { data: 'test' } });

      const { retoken } = createTestRetoken(mockFetch, { accessToken });

      await retoken.fetch('/api/users');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: expect.any(Headers) as unknown,
        })
      );

      const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Headers;
      expect(headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
    });

    it('should not add Authorization header when no token', async () => {
      const mockFetch = createMockFetch({ status: 200 });

      const { retoken } = createTestRetoken(mockFetch, {
        accessToken: null,
        refreshToken: null, // Also null to prevent proactive refresh
      });

      await retoken.fetch('/api/public', { skipProactiveRefresh: true });

      const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Headers;
      expect(headers.get('Authorization')).toBeNull();
    });

    it('should merge custom headers with Authorization', async () => {
      const accessToken = createValidToken();
      const mockFetch = createMockFetch({ status: 200 });

      const { retoken } = createTestRetoken(mockFetch, { accessToken });

      await retoken.fetch('/api/users', {
        headers: { 'X-Custom': 'value' },
      });

      const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Headers;
      expect(headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
      expect(headers.get('X-Custom')).toBe('value');
    });

    it('should pass through fetch options', async () => {
      const mockFetch = createMockFetch({ status: 200 });

      const { retoken } = createTestRetoken(mockFetch);

      await retoken.fetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
        })
      );
    });
  });

  describe('proactive refresh', () => {
    it('should proactively refresh when token is expiring soon', async () => {
      const soonExpiringToken = createSoonExpiringToken(60);
      const newAccessToken = createValidToken();
      const newRefreshToken = createValidToken();

      // First call is refresh, second is the actual request
      const mockFetch = createSequentialMockFetch([
        createRefreshResponse(newAccessToken, newRefreshToken),
        { status: 200, body: { data: 'test' } },
      ]);

      const { retoken } = createTestRetoken(mockFetch, {
        accessToken: soonExpiringToken,
        expirationLeeway: 60,
      });

      await retoken.fetch('/api/users');

      // First call should be to refresh endpoint
      expect(mockFetch.mock.calls[0][0]).toBe('/api/refresh');
      // Second call should be to the actual endpoint
      expect(mockFetch.mock.calls[1][0]).toBe('/api/users');
    });

    it('should skip proactive refresh when skipProactiveRefresh is true', async () => {
      const soonExpiringToken = createSoonExpiringToken(60);
      const mockFetch = createMockFetch({ status: 200 });

      const { retoken } = createTestRetoken(mockFetch, {
        accessToken: soonExpiringToken,
        expirationLeeway: 60,
      });

      await retoken.fetch('/api/users', { skipProactiveRefresh: true });

      // Only one call - no refresh
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/users');
    });

    it('should not proactively refresh when token is valid', async () => {
      const validToken = createValidToken();
      const mockFetch = createMockFetch({ status: 200 });

      const { retoken } = createTestRetoken(mockFetch, { accessToken: validToken });

      await retoken.fetch('/api/users');

      // Only one call - no refresh needed
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/users');
    });

    it('should continue request even if proactive refresh fails', async () => {
      const soonExpiringToken = createSoonExpiringToken(60);

      const mockFetch = createSequentialMockFetch([
        { status: 401, ok: false }, // Refresh fails with auth failure (no retry)
        { status: 200, body: { data: 'test' } }, // But request succeeds
      ]);

      const { retoken } = createTestRetoken(mockFetch, {
        accessToken: soonExpiringToken,
        expirationLeeway: 60,
      });

      const response = await retoken.fetch('/api/users');

      expect(response.status).toBe(200);
    });
  });

  describe('retry on 401', () => {
    it('should retry request after refresh on 401', async () => {
      const accessToken = createValidToken();
      const newAccessToken = createValidToken();
      const newRefreshToken = createValidToken();

      const mockFetch = createSequentialMockFetch([
        { status: 401, ok: false }, // First request fails with 401
        createRefreshResponse(newAccessToken, newRefreshToken), // Refresh succeeds
        { status: 200, body: { data: 'test' } }, // Retry succeeds
      ]);

      const { retoken } = createTestRetoken(mockFetch, { accessToken });

      const response = await retoken.fetch('/api/users');

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should skip retry when skipRetry is true', async () => {
      const accessToken = createValidToken();
      const mockFetch = createMockFetch({ status: 401, ok: false });

      const { retoken } = createTestRetoken(mockFetch, { accessToken });

      const response = await retoken.fetch('/api/users', { skipRetry: true });

      expect(response.status).toBe(401);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return original response if refresh fails during retry', async () => {
      const accessToken = createValidToken();

      const mockFetch = createSequentialMockFetch([
        { status: 401, ok: false }, // First request fails
        { status: 401, ok: false }, // Refresh also fails with auth error
      ]);

      const { retoken } = createTestRetoken(mockFetch, { accessToken });

      const response = await retoken.fetch('/api/users');

      expect(response.status).toBe(401);
    });

    it('should use custom retryStatuses', async () => {
      const accessToken = createValidToken();
      const newAccessToken = createValidToken();
      const newRefreshToken = createValidToken();

      const mockFetch = createSequentialMockFetch([
        { status: 403, ok: false }, // Custom retry status
        createRefreshResponse(newAccessToken, newRefreshToken),
        { status: 200, body: { data: 'test' } },
      ]);

      const { retoken } = createTestRetoken(mockFetch, {
        accessToken,
        retryStatuses: [401, 403],
      });

      const response = await retoken.fetch('/api/users');

      expect(response.status).toBe(200);
    });
  });

  describe('fetchJson', () => {
    it('should return parsed JSON on success', async () => {
      const mockFetch = createMockFetch({
        status: 200,
        body: { id: 1, name: 'Test User' },
      });

      const { retoken } = createTestRetoken(mockFetch);

      const result = await retoken.fetchJson<{ id: number; name: string }>('/api/users/1');

      expect(result).toEqual({ id: 1, name: 'Test User' });
    });

    it('should handle 201 status by default', async () => {
      const mockFetch = createMockFetch({
        status: 201,
        body: { id: 2, name: 'New User' },
      });

      const { retoken } = createTestRetoken(mockFetch);

      const result = await retoken.fetchJson('/api/users', { method: 'POST' });

      expect(result).toEqual({ id: 2, name: 'New User' });
    });

    it('should handle 204 No Content', async () => {
      const mockFetch = createMockFetch({ status: 204 });

      const { retoken } = createTestRetoken(mockFetch, {
        accessToken: createValidToken(),
      });

      const result = await retoken.fetchJson('/api/users/1', {
        method: 'DELETE',
        expectedStatuses: [200, 201, 204],
      });

      expect(result).toBeNull();
    });

    it('should throw FetchError on unexpected status', async () => {
      const mockFetch = createMockFetch({
        status: 404,
        ok: false,
        body: { error: 'Not found' },
      });

      const { retoken } = createTestRetoken(mockFetch);

      await expect(retoken.fetchJson('/api/users/999')).rejects.toThrow(FetchError);

      try {
        await retoken.fetchJson('/api/users/999');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).status).toBe(404);
        expect((error as FetchError).body).toEqual({ error: 'Not found' });
      }
    });

    it('should use custom expectedStatuses', async () => {
      const mockFetch = createMockFetch({
        status: 202,
        body: { status: 'accepted' },
      });

      const { retoken } = createTestRetoken(mockFetch);

      const result = await retoken.fetchJson('/api/jobs', {
        method: 'POST',
        expectedStatuses: [200, 202],
      });

      expect(result).toEqual({ status: 'accepted' });
    });
  });

  describe('utility methods', () => {
    it('isTokenExpiringSoon should check current token', () => {
      const soonExpiringToken = createSoonExpiringToken(60);
      const mockFetch = createMockFetch({ status: 200 });

      const { retoken } = createTestRetoken(mockFetch, {
        accessToken: soonExpiringToken,
        expirationLeeway: 60,
      });

      expect(retoken.isTokenExpiringSoon()).toBe(true);
    });

    it('isTokenExpiringSoon should return false for valid token', () => {
      const validToken = createValidToken();
      const mockFetch = createMockFetch({ status: 200 });

      const { retoken } = createTestRetoken(mockFetch, { accessToken: validToken });

      expect(retoken.isTokenExpiringSoon()).toBe(false);
    });

    it('parseTokenExpiration should parse token', () => {
      const mockFetch = createMockFetch({ status: 200 });
      const { retoken } = createTestRetoken(mockFetch);

      const expSeconds = 1700000000;
      const token = createToken(expSeconds);

      expect(retoken.parseTokenExpiration(token)).toBe(expSeconds * 1000);
    });

    it('refreshToken should manually trigger refresh', async () => {
      const newAccessToken = createValidToken();
      const newRefreshToken = createValidToken();
      const mockFetch = createMockFetch(createRefreshResponse(newAccessToken, newRefreshToken));

      const { retoken, onTokenRefresh } = createTestRetoken(mockFetch);

      const result = await retoken.refreshToken();

      expect(result).toEqual({ accessToken: newAccessToken, refreshToken: newRefreshToken });
      expect(onTokenRefresh).toHaveBeenCalledWith({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    });
  });

  describe('cross-tab sync', () => {
    let mockChannel: {
      postMessage: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      onmessage: ((event: MessageEvent) => void) | null;
    };
    let originalBroadcastChannel: typeof BroadcastChannel | undefined;

    beforeEach(() => {
      originalBroadcastChannel = globalThis.BroadcastChannel;

      mockChannel = {
        postMessage: vi.fn(),
        close: vi.fn(),
        onmessage: null,
      };

      // Create a proper class mock
      const MockBroadcastChannel = class {
        constructor() {
          return mockChannel;
        }
      };
      globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;
    });

    afterEach(() => {
      if (originalBroadcastChannel) {
        globalThis.BroadcastChannel = originalBroadcastChannel;
      } else {
        // @ts-expect-error - deleting to restore undefined state
        delete globalThis.BroadcastChannel;
      }
    });

    it('should broadcast logout', () => {
      const mockFetch = createMockFetch({ status: 200 });

      const { retoken } = createTestRetoken(mockFetch, { crossTabEnabled: true });

      retoken.broadcastLogout();

      expect(mockChannel.postMessage).toHaveBeenCalledWith({ type: 'LOGOUT' });
    });

    it('should close channel on destroy', () => {
      const mockFetch = createMockFetch({ status: 200 });

      const { retoken } = createTestRetoken(mockFetch, { crossTabEnabled: true });

      retoken.destroy();

      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should clear tokens when receiving logout from another tab', () => {
      const mockFetch = createMockFetch({ status: 200 });
      const onAuthFailure = vi.fn();

      createTestRetoken(mockFetch, {
        crossTabEnabled: true,
        onAuthFailure,
      });

      // Simulate receiving logout message
      mockChannel.onmessage?.({ data: { type: 'LOGOUT' } } as MessageEvent);

      expect(tokenStore.accessToken).toBeNull();
      expect(tokenStore.refreshToken).toBeNull();
      expect(onAuthFailure).toHaveBeenCalled();
    });
  });
});
