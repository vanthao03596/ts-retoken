/**
 * ts-retoken Usage Examples with Full Type Safety
 *
 * This file demonstrates how to use ts-retoken with TypeScript
 * for maximum type safety and developer experience.
 */

import {
  createRetoken,
  RefreshError,
  FetchError,
  isTokenExpiringSoon,
  parseTokenExpiration,
  type RetokenConfig,
  type TokenPair,
  type RetokenInstance,
} from '../src';

// ============================================================
// Step 1: Define Your API Response Types
// ============================================================

/**
 * Define the exact shape of your refresh API response.
 * This enables full autocomplete in parseResponse.
 */
interface MyRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Alternative: Nested response structure
 */
interface NestedRefreshResponse {
  success: boolean;
  data: {
    tokens: {
      access: string;
      refresh: string;
    };
    user: {
      id: string;
      email: string;
    };
  };
}

// ============================================================
// Step 2: Create Type-Safe Configuration
// ============================================================

/**
 * Example 1: Simple flat response structure
 */
const simpleConfig: RetokenConfig<MyRefreshResponse> = {
  refreshEndpoint: {
    url: 'https://api.example.com/auth/refresh',
    method: 'POST',
    headers: {
      'X-Client-Version': '1.0.0',
    },
    buildBody: (refreshToken: string) => {
      return JSON.stringify({ refresh_token: refreshToken });
    },
    parseResponse: (response) => {
      // 'response' is typed as MyRefreshResponse
      // Full autocomplete: response.access_token, response.refresh_token, etc.
      return {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
      };
    },
  },
  getAccessToken: () => localStorage.getItem('access_token'),
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setTokens: (tokens: TokenPair) => {
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
  },
  clearTokens: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
  expirationLeeway: 60,
  retryStatuses: [401],
  refreshFailureStatuses: [401, 403],
  onAuthFailure: () => {
    console.log('Auth failed, redirecting to login...');
    window.location.href = '/login';
  },
  onTokenRefresh: (tokens: TokenPair) => {
    console.log('Tokens refreshed successfully');
  },
};

/**
 * Example 2: Nested response structure
 */
const nestedConfig: RetokenConfig<NestedRefreshResponse> = {
  refreshEndpoint: {
    url: 'https://api.example.com/auth/refresh',
    parseResponse: (response) => {
      // 'response' is typed as NestedRefreshResponse
      // Full autocomplete: response.data.tokens.access, etc.
      return {
        accessToken: response.data.tokens.access,
        refreshToken: response.data.tokens.refresh,
      };
    },
  },
  getAccessToken: () => localStorage.getItem('access_token'),
  getRefreshToken: () => localStorage.getItem('refresh_token'),
  setTokens: (tokens) => {
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
  },
  clearTokens: () => localStorage.clear(),
};

/**
 * Example 3: HTTP-only Cookie Mode (no getRefreshToken)
 */
const cookieConfig: RetokenConfig<MyRefreshResponse> = {
  refreshEndpoint: {
    url: 'https://api.example.com/auth/refresh',
    credentials: 'include', // Important: sends cookies
    parseResponse: (response) => ({
      accessToken: response.access_token,
      refreshToken: '', // Not stored client-side in cookie mode
    }),
  },
  getAccessToken: () => localStorage.getItem('access_token'),
  // getRefreshToken is OMITTED - this enables cookie mode
  setTokens: (tokens) => {
    localStorage.setItem('access_token', tokens.accessToken);
  },
  clearTokens: () => localStorage.removeItem('access_token'),
  refreshFailureStatuses: [401, 403],
};

// ============================================================
// Step 3: Create Retoken Instance
// ============================================================

// Create instance with type parameter for full type safety
const retoken: RetokenInstance = createRetoken<MyRefreshResponse>(simpleConfig);

// Or let TypeScript infer the type
const retokenInferred = createRetoken<NestedRefreshResponse>(nestedConfig);

// Cookie mode instance
const retokenCookie = createRetoken<MyRefreshResponse>(cookieConfig);

// ============================================================
// Step 4: Using fetchJson with Type Safety
// ============================================================

/**
 * Define your API response types
 */
interface User {
  id: string;
  name: string;
  email: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface CreateUserRequest {
  name: string;
  email: string;
}

/**
 * Type-safe GET request - returns typed data directly
 */
async function fetchUsers(): Promise<User[]> {
  // TypeScript knows this returns User[]
  const users = await retoken.fetchJson<User[]>('https://api.example.com/users');
  console.log('Users:', users);
  return users;
}

/**
 * Type-safe GET with pagination
 */
async function fetchUsersPaginated(page: number): Promise<PaginatedResponse<User>> {
  const result = await retoken.fetchJson<PaginatedResponse<User>>(
    `https://api.example.com/users?page=${page}`
  );
  // Full autocomplete: result.data, result.total, result.page
  console.log(`Page ${result.page} of ${Math.ceil(result.total / result.pageSize)}`);
  return result;
}

/**
 * Type-safe GET single item
 */
async function fetchUser(id: string): Promise<User> {
  const user = await retoken.fetchJson<User>(`https://api.example.com/users/${id}`);
  // Full autocomplete: user.id, user.name, user.email
  console.log('User name:', user.name);
  return user;
}

/**
 * Type-safe POST request
 */
async function createUser(data: CreateUserRequest): Promise<User> {
  const newUser = await retoken.fetchJson<User>('https://api.example.com/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    expectedStatuses: [201], // Only 201 Created is success
  });
  console.log('Created user:', newUser.id);
  return newUser;
}

/**
 * Type-safe DELETE (returns void/null)
 */
async function deleteUser(id: string): Promise<void> {
  await retoken.fetchJson<null>(`https://api.example.com/users/${id}`, {
    method: 'DELETE',
    expectedStatuses: [204], // 204 No Content
  });
  console.log('User deleted');
}

/**
 * Error handling with FetchError
 */
async function fetchUserSafe(id: string): Promise<User | null> {
  try {
    return await retoken.fetchJson<User>(`https://api.example.com/users/${id}`);
  } catch (error) {
    if (error instanceof FetchError) {
      console.error('Request failed:', error.status);
      console.error('Error body:', error.body);

      // Handle specific status codes
      if (error.status === 404) {
        return null; // User not found
      }
    }
    throw error;
  }
}

// ============================================================
// Step 5: Using the Raw Fetch Wrapper
// ============================================================

/**
 * Raw fetch when you need access to Response object
 */
async function fetchUsersRaw(): Promise<void> {
  const response = await retoken.fetch('https://api.example.com/users');

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const users: unknown = await response.json();
  console.log('Users:', users);
}

/**
 * Fetch with skip options (public endpoints)
 */
async function publicEndpoint(): Promise<void> {
  const response = await retoken.fetch('https://api.example.com/public/health', {
    skipProactiveRefresh: true,
    skipRetry: true,
  });
  console.log('Health check:', response.status);
}

// ============================================================
// Step 6: Manual Token Management
// ============================================================

/**
 * Manually refresh token when needed
 */
async function manualRefresh(): Promise<void> {
  try {
    const tokens: TokenPair = await retoken.refreshToken();
    console.log('New access token:', tokens.accessToken);
  } catch (error) {
    if (error instanceof RefreshError) {
      console.error('Refresh failed with status:', error.status);
    }
    throw error;
  }
}

/**
 * Check token status before making requests
 */
function checkTokenStatus(): void {
  const isExpiringSoon = retoken.isTokenExpiringSoon();
  console.log('Token expiring soon:', isExpiringSoon);

  const token = localStorage.getItem('access_token');
  if (token) {
    const expiresAt = retoken.parseTokenExpiration(token);
    if (expiresAt) {
      console.log('Token expires at:', new Date(expiresAt));
    }
  }
}

// ============================================================
// Step 6: Cross-Tab Synchronization
// ============================================================

/**
 * Create instance with cross-tab sync enabled
 */
const retokenWithCrossTab = createRetoken<MyRefreshResponse>({
  ...simpleConfig,
  crossTab: {
    enabled: true,
    channelName: 'my-app-auth', // Optional custom channel name
  },
});

/**
 * Manual logout with cross-tab broadcast
 */
function logout(): void {
  // Broadcast logout to all other tabs
  retokenWithCrossTab.broadcastLogout();

  // Clear local storage
  localStorage.clear();

  // Redirect to login
  window.location.href = '/login';
}

/**
 * Cleanup on app unmount (important for SPA)
 */
function cleanup(): void {
  retokenWithCrossTab.destroy();
}

// ============================================================
// Step 7: Standalone Utilities
// ============================================================

/**
 * Use JWT utilities independently
 */
function jwtUtilities(): void {
  const token = localStorage.getItem('access_token');

  // Check if expiring within 120 seconds
  const expiringSoon = isTokenExpiringSoon(token, 120);
  console.log('Expiring in 2 minutes:', expiringSoon);

  // Parse expiration timestamp
  if (token) {
    const expiresAt = parseTokenExpiration(token);
    if (expiresAt) {
      const remainingMs = expiresAt - Date.now();
      console.log('Remaining time:', Math.floor(remainingMs / 1000), 'seconds');
    }
  }
}

// ============================================================
// Step 8: Error Handling
// ============================================================

/**
 * Comprehensive error handling
 */
async function robustFetch<T>(url: string): Promise<T> {
  try {
    const response = await retoken.fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof RefreshError) {
      // Token refresh failed
      console.error('Authentication failed:', error.message);
      console.error('Status code:', error.status);

      // Handle specific status codes
      if (error.status === 401) {
        console.log('Refresh token expired');
      } else if (error.status === 403) {
        console.log('Refresh token revoked');
      }
    }

    throw error;
  }
}

// ============================================================
// Step 9: Dynamic Callbacks with React Hooks
// ============================================================

/**
 * When using React Router or other hooks inside onAuthFailure,
 * you need a ref pattern since callbacks are captured at creation time.
 *
 * This pattern allows you to use hooks like useNavigate() in callbacks.
 */

// lib/authClient.ts - Create retoken with mutable callback holder
interface AuthCallbacks {
  onAuthFailure: () => void;
  onTokenRefresh: (tokens: TokenPair) => void;
}

const authCallbacks: AuthCallbacks = {
  onAuthFailure: () => {},
  onTokenRefresh: () => {},
};

const retokenWithDynamicCallbacks = createRetoken<MyRefreshResponse>({
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
  // Callbacks delegate to mutable refs
  onAuthFailure: () => authCallbacks.onAuthFailure(),
  onTokenRefresh: (tokens) => authCallbacks.onTokenRefresh(tokens),
});

/**
 * React Provider component that sets up dynamic callbacks
 *
 * // AuthProvider.tsx
 * import { useEffect } from 'react';
 * import { useNavigate } from 'react-router-dom';
 * import { authCallbacks } from './authClient';
 *
 * export function AuthProvider({ children }: { children: React.ReactNode }) {
 *   const navigate = useNavigate();
 *
 *   useEffect(() => {
 *     // Set callbacks that can use React hooks
 *     authCallbacks.onAuthFailure = () => {
 *       navigate('/login');
 *     };
 *
 *     authCallbacks.onTokenRefresh = (tokens) => {
 *       console.log('Tokens refreshed:', tokens.accessToken.slice(0, 20) + '...');
 *     };
 *
 *     // Cleanup on unmount
 *     return () => {
 *       authCallbacks.onAuthFailure = () => {};
 *       authCallbacks.onTokenRefresh = () => {};
 *     };
 *   }, [navigate]);
 *
 *   return <>{children}</>;
 * }
 *
 * // App.tsx
 * import { BrowserRouter } from 'react-router-dom';
 * import { AuthProvider } from './AuthProvider';
 *
 * function App() {
 *   return (
 *     <BrowserRouter>
 *       <AuthProvider>
 *         <Routes />
 *       </AuthProvider>
 *     </BrowserRouter>
 *   );
 * }
 */

// ============================================================
// Step 10: Integration with State Management
// ============================================================

/**
 * Example: Integration with Zustand-like store
 */
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (tokens: TokenPair) => void;
  clearTokens: () => void;
}

// Simulated store (replace with your actual store)
const authStore: AuthState = {
  accessToken: null,
  refreshToken: null,
  setTokens(tokens) {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
  },
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
  },
};

/**
 * Create retoken instance using store
 */
const retokenWithStore = createRetoken<MyRefreshResponse>({
  refreshEndpoint: {
    url: 'https://api.example.com/auth/refresh',
    parseResponse: (data) => ({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    }),
  },
  getAccessToken: () => authStore.accessToken,
  getRefreshToken: () => authStore.refreshToken,
  setTokens: (tokens) => authStore.setTokens(tokens),
  clearTokens: () => authStore.clearTokens(),
});

// ============================================================
// Export for use in application
// ============================================================

export {
  // Instances
  retoken,
  retokenInferred,
  retokenCookie,
  retokenWithCrossTab,
  retokenWithDynamicCallbacks,
  retokenWithStore,
  authCallbacks,

  // Type-safe fetchJson examples
  fetchUsers,
  fetchUsersPaginated,
  fetchUser,
  createUser,
  deleteUser,
  fetchUserSafe,

  // Raw fetch examples
  fetchUsersRaw,
  publicEndpoint,

  // Token management
  manualRefresh,
  checkTokenStatus,
  jwtUtilities,

  // Cross-tab
  logout,
  cleanup,

  // Error handling
  robustFetch,
};
