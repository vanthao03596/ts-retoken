/**
 * JWT payload structure (minimal, only what we need)
 */
interface JwtPayload {
  exp?: number;
}

/**
 * Decode a base64url encoded string (RFC 4648)
 * Handles URL-safe characters (-_) and missing padding
 */
function base64UrlDecode(str: string): string {
  // Replace URL-safe chars with standard base64
  let output = str.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  switch (output.length % 4) {
    case 2:
      output += '==';
      break;
    case 3:
      output += '=';
      break;
  }

  return atob(output);
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

    const payload = JSON.parse(base64UrlDecode(parts[1])) as JwtPayload;
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
