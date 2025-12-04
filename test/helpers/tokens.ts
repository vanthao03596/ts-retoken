/**
 * Test helper utilities for creating JWT tokens
 */

/**
 * Encode a string to base64url format (RFC 4648)
 */
function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create a JWT token with a specific expiration timestamp
 * @param expSeconds - Expiration time in seconds (Unix timestamp)
 * @returns JWT token string
 */
export function createToken(expSeconds: number): string {
  const header = { alg: 'HS256' };
  const payload = { exp: expSeconds };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = 'test-signature';

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Create a JWT token that expires at a specific time relative to now
 * @param offsetSeconds - Seconds from now (positive = future, negative = past)
 * @returns JWT token string
 */
export function createTokenWithOffset(offsetSeconds: number): string {
  const expSeconds = Math.floor(Date.now() / 1000) + offsetSeconds;
  return createToken(expSeconds);
}

/**
 * Create an expired token (expired 1 hour ago)
 */
export function createExpiredToken(): string {
  return createTokenWithOffset(-3600);
}

/**
 * Create a valid token (expires in 1 hour)
 */
export function createValidToken(): string {
  return createTokenWithOffset(3600);
}

/**
 * Create a token that expires soon (within specified leeway)
 * @param leewaySeconds - The leeway period in seconds
 * @returns Token that expires within the leeway period
 */
export function createSoonExpiringToken(leewaySeconds: number): string {
  // Expires in half the leeway time
  return createTokenWithOffset(Math.floor(leewaySeconds / 2));
}

/**
 * Create a token without an exp claim
 */
export function createTokenWithoutExp(): string {
  const header = { alg: 'HS256' };
  const payload = { sub: '1234567890' };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = 'test-signature';

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Create a token with additional claims
 */
export function createTokenWithClaims(expSeconds: number, claims: Record<string, unknown>): string {
  const header = { alg: 'HS256' };
  const payload = { exp: expSeconds, ...claims };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = 'test-signature';

  return `${headerB64}.${payloadB64}.${signature}`;
}
