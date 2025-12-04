# ts-retoken

A lightweight, type-safe token refresh library for JavaScript/TypeScript applications. Zero dependencies, works with any frontend framework.

## Features

- **Type-safe**: Full TypeScript support with generics for API response types
- **Two storage modes**: localStorage or HTTP-only cookie
- **Configurable**: Custom status codes, retry delays, and response parsing
- **Proactive refresh**: Refreshes tokens before they expire
- **Request deduplication**: Only one refresh request at a time
- **Retry with backoff**: Exponential backoff for failed refresh requests
- **Cross-tab sync**: Optional logout synchronization across browser tabs
- **Zero dependencies**: Uses native `fetch` API

## Installation

```bash
npm install ts-retoken
```

## Quick Start

```typescript
import { createRetoken } from 'ts-retoken';

const retoken = createRetoken({
  refreshEndpoint: {
    url: 'https://api.example.com/auth/refresh',
    parseResponse: (data) => ({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    }),
  },
  getAccessToken: () => localStorage.getItem('access_token'),
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setTokens: (tokens) => {
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
  },
  clearTokens: () => localStorage.clear(),
  onAuthFailure: () => {
    window.location.href = '/login';
  },
});

// Use the fetch wrapper - handles token refresh automatically
const response = await retoken.fetch('/api/users/me');
const user = await response.json();
```

## Storage Modes

### Mode 1: localStorage (or any storage)

Provide `getRefreshToken` to use localStorage, sessionStorage, or any custom storage:

```typescript
const retoken = createRetoken({
  refreshEndpoint: {
    url: '/api/auth/refresh',
    buildBody: (token) => JSON.stringify({ refresh_token: token }),
    parseResponse: (data) => ({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    }),
  },
  getAccessToken: () => localStorage.getItem('access_token'),
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setTokens: (tokens) => {
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
  },
  clearTokens: () => localStorage.clear(),
});
```

### Mode 2: HTTP-only Cookie

Omit `getRefreshToken` for HTTP-only cookie mode. The refresh token is sent automatically via cookies:

```typescript
const retoken = createRetoken({
  refreshEndpoint: {
    url: '/api/auth/refresh',
    credentials: 'include', // Send cookies with request
    parseResponse: (data) => ({
      accessToken: data.access_token,
      refreshToken: '', // Not needed in cookie mode
    }),
  },
  getAccessToken: () => localStorage.getItem('access_token'),
  // getRefreshToken OMITTED = cookie mode
  setTokens: (tokens) => {
    localStorage.setItem('access_token', tokens.accessToken);
  },
  clearTokens: () => localStorage.removeItem('access_token'),
});
```

## Type-Safe API Responses

Use generics to get full TypeScript inference for your API response:

```typescript
// Define your API response type
interface RefreshResponse {
  data: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

// Pass it as a generic parameter
const retoken = createRetoken<RefreshResponse>({
  refreshEndpoint: {
    url: '/api/auth/refresh',
    parseResponse: (data) => ({
      // 'data' is typed as RefreshResponse
      // TypeScript will autocomplete: data.data.access_token
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
    }),
  },
  // ... other config
});
```

## API Reference

### `createRetoken<TResponse>(config)`

Creates a retoken instance with the provided configuration.

#### Config Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `refreshEndpoint` | `RefreshEndpointConfig` | Yes | - | Refresh endpoint configuration |
| `getAccessToken` | `() => string \| null` | Yes | - | Function to get current access token |
| `getRefreshToken` | `() => string \| null` | No | - | Function to get refresh token (omit for cookie mode) |
| `setTokens` | `(tokens: TokenPair) => void` | Yes | - | Function to store new tokens |
| `clearTokens` | `() => void` | Yes | - | Function to clear tokens on auth failure |
| `expirationLeeway` | `number` | No | `60` | Seconds before expiration to refresh proactively |
| `retryStatuses` | `number[]` | No | `[401]` | Status codes that trigger refresh + retry |
| `refreshFailureStatuses` | `number[]` | No | `[401, 403]` | Refresh status codes that mean auth failed |
| `retry` | `RetryConfig` | No | See below | Retry configuration |
| `crossTab` | `CrossTabConfig` | No | `{ enabled: false }` | Cross-tab sync configuration |
| `onAuthFailure` | `() => void` | No | - | Callback when auth fails completely |
| `onTokenRefresh` | `(tokens: TokenPair) => void` | No | - | Callback when tokens are refreshed |

#### RefreshEndpointConfig

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `url` | `string` | Yes | - | Full URL to refresh endpoint |
| `method` | `'POST' \| 'PUT'` | No | `'POST'` | HTTP method |
| `credentials` | `RequestCredentials` | No | `'same-origin'` | Fetch credentials mode |
| `headers` | `Record<string, string>` | No | - | Additional headers |
| `buildBody` | `(token: string) => BodyInit` | No | JSON with `refresh_token` | Build request body |
| `parseResponse` | `(response: TResponse) => TokenPair` | Yes | - | Parse response to TokenPair |

#### RetryConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `delays` | `number[]` | `[3000, 6000, 12000]` | Delays between retries (ms) |
| `skipOnClientError` | `boolean` | `true` | Skip retry on 4xx errors |

#### CrossTabConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable cross-tab sync |
| `channelName` | `string` | `'ts-retoken-auth'` | BroadcastChannel name |

### RetokenInstance

The object returned by `createRetoken()`:

| Method | Type | Description |
|--------|------|-------------|
| `fetch` | `(url: string, options?: RetokenFetchOptions) => Promise<Response>` | Fetch wrapper with auto-refresh |
| `fetchJson` | `<T>(url: string, options?: RetokenFetchJsonOptions) => Promise<T>` | Type-safe fetch that returns parsed JSON |
| `refreshToken` | `() => Promise<TokenPair>` | Manually trigger token refresh |
| `isTokenExpiringSoon` | `() => boolean` | Check if access token expires soon |
| `parseTokenExpiration` | `(token: string) => number \| null` | Parse JWT expiration (ms) |
| `broadcastLogout` | `() => void` | Broadcast logout to other tabs |
| `destroy` | `() => void` | Cleanup resources |

### RetokenFetchOptions

Options for the `fetch` wrapper (extends `RequestInit`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headers` | `Record<string, string>` | - | Request headers |
| `skipProactiveRefresh` | `boolean` | `false` | Skip proactive token refresh |
| `skipRetry` | `boolean` | `false` | Skip retry on retryStatuses |

### RetokenFetchJsonOptions

Options for the `fetchJson` wrapper (extends `RetokenFetchOptions`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `expectedStatuses` | `number[]` | `[200, 201]` | HTTP status codes that indicate success |

### `fetchJson<T>(url, options)`

Type-safe fetch wrapper that returns parsed JSON with automatic token management.

**Features:**
- Proactively refreshes token if expiring soon (unless `skipProactiveRefresh` is true)
- Retries with a new token on 401 responses (unless `skipRetry` is true)
- Parses response body as JSON with full type safety
- Throws `FetchError` for unexpected HTTP status codes
- Returns `null` for 204 No Content responses

**Basic Usage:**

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

// GET request - response is typed as User
const user = await retoken.fetchJson<User>('/api/users/me');
console.log(user.name); // Fully typed
```

**POST Request with Custom Status Codes:**

```typescript
interface CreateUserResponse {
  id: string;
  createdAt: string;
}

const newUser = await retoken.fetchJson<CreateUserResponse>('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
  expectedStatuses: [201], // Only 201 is considered success
});
```

**Error Handling:**

```typescript
import { FetchError } from 'ts-retoken';

try {
  const data = await retoken.fetchJson<SomeType>('/api/resource');
} catch (error) {
  if (error instanceof FetchError) {
    console.log(error.message); // "Request failed with status 404"
    console.log(error.status);  // 404
    console.log(error.body);    // Parsed error response body (if JSON)
  }
}
```

**FetchError Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `message` | `string` | Error message including status code |
| `status` | `number` | HTTP status code |
| `body` | `unknown` | Parsed response body (if JSON) or `null` |

## Standalone Utilities

```typescript
import { isTokenExpiringSoon, parseTokenExpiration, RefreshError } from 'ts-retoken';

// Check if token expires within 60 seconds
const expiring = isTokenExpiringSoon(token, 60);

// Parse expiration timestamp from JWT
const expiresAt = parseTokenExpiration(token); // milliseconds or null

// RefreshError has a status property
try {
  await retoken.refreshToken();
} catch (error) {
  if (error instanceof RefreshError) {
    console.log('Refresh failed with status:', error.status);
  }
}
```

## Advanced Examples

### With React

```typescript
// lib/auth.ts
import { createRetoken } from 'ts-retoken';

export const retoken = createRetoken({
  refreshEndpoint: {
    url: `${import.meta.env.VITE_API_URL}/auth/refresh`,
    parseResponse: (data) => ({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    }),
  },
  getAccessToken: () => localStorage.getItem('access_token'),
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setTokens: (tokens) => {
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
  },
  clearTokens: () => localStorage.clear(),
  crossTab: { enabled: true },
  onAuthFailure: () => {
    window.location.href = '/login';
  },
});

// Use in components
const users = await retoken.fetch('/api/users').then(r => r.json());
```

### With Vue

```typescript
// composables/useAuth.ts
import { createRetoken } from 'ts-retoken';
import { ref, onUnmounted } from 'vue';

const accessToken = ref<string | null>(localStorage.getItem('access_token'));

export const retoken = createRetoken({
  refreshEndpoint: {
    url: '/api/auth/refresh',
    parseResponse: (data) => ({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    }),
  },
  getAccessToken: () => accessToken.value,
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setTokens: (tokens) => {
    accessToken.value = tokens.accessToken;
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
  },
  clearTokens: () => {
    accessToken.value = null;
    localStorage.clear();
  },
});

export function useAuth() {
  onUnmounted(() => retoken.destroy());
  return { fetch: retoken.fetch, isTokenExpiringSoon: retoken.isTokenExpiringSoon };
}
```

### Manual Token Refresh

Use with your own HTTP client (axios, ky, etc.):

```typescript
import { createRetoken } from 'ts-retoken';
import axios from 'axios';

const retoken = createRetoken({ /* config */ });

// Ensure valid token before axios request
async function apiRequest(url: string) {
  if (retoken.isTokenExpiringSoon()) {
    await retoken.refreshToken();
  }

  return axios.get(url, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('access_token')}`,
    },
  });
}
```

### Custom Retry Configuration

```typescript
const retoken = createRetoken({
  // ...
  retry: {
    delays: [1000, 2000, 4000, 8000], // 4 retries
    skipOnClientError: true,
  },
  expirationLeeway: 30, // Refresh 30s before expiration
});
```

### Custom Status Codes

```typescript
const retoken = createRetoken({
  // ...

  // Original request: which statuses trigger refresh + retry
  retryStatuses: [401, 403],

  // Refresh request: which statuses mean "auth failed completely"
  refreshFailureStatuses: [401, 403, 422],
});
```

## How It Works

1. **Proactive Refresh**: Before each request, checks if the access token expires within `expirationLeeway` seconds. If so, refreshes the token first.

2. **Fallback Refresh**: If the request returns a status in `retryStatuses` (default: 401), attempts to refresh the token and retries the request.

3. **Request Deduplication**: If multiple requests trigger a refresh simultaneously, only one refresh request is made. All pending requests wait for the same refresh promise.

4. **Retry with Backoff**: Failed refresh requests are retried with exponential backoff (default: 3s, 6s, 12s). Client errors (4xx) are not retried.

5. **Auth Failure**: When the refresh request returns a status in `refreshFailureStatuses`, `onAuthFailure` is called and no more retries are attempted.

## License

MIT
