/**
 * JWT payload structure (minimal, only what we need)
 */
interface JwtPayload {
  exp?: number;
}

/**
 * Parse the expiration timestamp (in milliseconds) from a JWT token
 * Returns null if token is invalid or has no exp claim
 *
 * @param token - JWT token string
 * @returns Expiration timestamp in milliseconds, or null if invalid
 */
export function parseTokenExpiration(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1])) as JwtPayload;
    if (typeof payload.exp !== 'number') return null;

    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expiring within the leeway period
 *
 * @param token - JWT token string, or null
 * @param leewaySeconds - Seconds before expiration to consider "expiring soon"
 * @returns true if token is null, invalid, or expiring soon
 */
export function isTokenExpiringSoon(
  token: string | null,
  leewaySeconds: number
): boolean {
  if (!token) return true;

  const exp = parseTokenExpiration(token);
  if (exp === null) return true;

  return Date.now() >= exp - leewaySeconds * 1000;
}
