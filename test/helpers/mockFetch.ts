import { vi } from 'vitest';

/**
 * Response configuration for mock fetch
 */
export interface MockResponseConfig {
  status?: number;
  statusText?: string;
  body?: unknown;
  headers?: Record<string, string>;
  ok?: boolean;
}

/**
 * Create a mock Response object
 */
export function createMockResponse(config: MockResponseConfig = {}): Response {
  const {
    status = 200,
    statusText = 'OK',
    body = {},
    headers = {},
    ok = status >= 200 && status < 300,
  } = config;

  return {
    ok,
    status,
    statusText,
    headers: new Headers(headers),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    clone: vi.fn().mockReturnThis(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    blob: vi.fn().mockResolvedValue(new Blob()),
    formData: vi.fn().mockResolvedValue(new FormData()),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    bytes: vi.fn().mockResolvedValue(new Uint8Array()),
  } as Response;
}

/**
 * Create a mock fetch function that returns a single response
 */
export function createMockFetch(config: MockResponseConfig = {}): ReturnType<typeof vi.fn> {
  const response = createMockResponse(config);
  return vi.fn().mockResolvedValue(response);
}

/**
 * Create a mock fetch function that returns responses in sequence
 * Useful for testing retry logic
 */
export function createSequentialMockFetch(
  configs: MockResponseConfig[]
): ReturnType<typeof vi.fn> {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const config = configs[callIndex] ?? configs[configs.length - 1];
    callIndex++;
    return Promise.resolve(createMockResponse(config));
  });
}

/**
 * Create a mock fetch that rejects with an error
 */
export function createFailingFetch(error: Error = new Error('Network error')): ReturnType<typeof vi.fn> {
  return vi.fn().mockRejectedValue(error);
}

/**
 * Setup global fetch mock and return cleanup function
 */
export function setupFetchMock(mockFetch: ReturnType<typeof vi.fn>): () => void {
  const originalFetch = globalThis.fetch;
  vi.stubGlobal('fetch', mockFetch);

  return () => {
    vi.stubGlobal('fetch', originalFetch);
  };
}

/**
 * Token pair response helper
 */
export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
}

/**
 * Create a successful token refresh response
 */
export function createRefreshResponse(
  accessToken: string,
  refreshToken: string
): MockResponseConfig {
  return {
    status: 200,
    body: {
      access_token: accessToken,
      refresh_token: refreshToken,
    },
  };
}
