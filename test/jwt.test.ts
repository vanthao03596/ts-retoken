import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseTokenExpiration, isTokenExpiringSoon } from '../src/jwt';
import {
  createToken,
  createTokenWithOffset,
  createExpiredToken,
  createValidToken,
  createSoonExpiringToken,
  createTokenWithoutExp,
} from './helpers/tokens';

describe('parseTokenExpiration', () => {
  it('should parse valid JWT expiration', () => {
    // JWT with exp: 1234567890
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjEyMzQ1Njc4OTB9.signature';
    const exp = parseTokenExpiration(token);
    expect(exp).toBe(1234567890 * 1000);
  });

  it('should parse token created by helper', () => {
    const expSeconds = 1700000000;
    const token = createToken(expSeconds);
    const exp = parseTokenExpiration(token);
    expect(exp).toBe(expSeconds * 1000);
  });

  it.each([
    ['invalid', 'invalid token'],
    ['only.two', 'wrong number of parts (2)'],
    ['too.many.parts.here', 'wrong number of parts (4)'],
    ['header.!!!invalid!!!.signature', 'invalid base64 payload'],
    ['header.bm90IGpzb24.signature', 'non-JSON payload'],
    ['', 'empty string'],
  ])('should return null for %s (%s)', (token) => {
    expect(parseTokenExpiration(token)).toBeNull();
  });

  it('should return null for token without exp claim', () => {
    const token = createTokenWithoutExp();
    expect(parseTokenExpiration(token)).toBeNull();
  });
});

describe('isTokenExpiringSoon', () => {
  let originalDateNow: () => number;

  beforeEach(() => {
    originalDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it.each([
    [null, 'null token'],
    ['', 'empty string'],
    ['invalid-token', 'invalid token'],
  ])('should return true for %s (%s)', (token, _description) => {
    expect(isTokenExpiringSoon(token, 60)).toBe(true);
  });

  it('should return true for expired token', () => {
    const token = createExpiredToken();
    expect(isTokenExpiringSoon(token, 60)).toBe(true);
  });

  it('should return false for valid token with plenty of time', () => {
    const token = createValidToken(); // expires in 1 hour
    expect(isTokenExpiringSoon(token, 60)).toBe(false);
  });

  it('should return true for token expiring within leeway', () => {
    const leeway = 60; // 60 seconds
    const token = createSoonExpiringToken(leeway); // expires in 30 seconds
    expect(isTokenExpiringSoon(token, leeway)).toBe(true);
  });

  it('should return false for token just outside leeway', () => {
    // Token expires in 120 seconds, leeway is 60 seconds
    const token = createTokenWithOffset(120);
    expect(isTokenExpiringSoon(token, 60)).toBe(false);
  });

  it('should return true when current time equals expiration minus leeway', () => {
    const now = 1700000000000; // Fixed timestamp in ms
    Date.now = vi.fn().mockReturnValue(now);

    // Token expires at now + 60 seconds
    const expSeconds = Math.floor(now / 1000) + 60;
    const token = createToken(expSeconds);

    // Leeway is 60 seconds, so it should be expiring soon
    expect(isTokenExpiringSoon(token, 60)).toBe(true);
  });

  it('should return false when current time is before expiration minus leeway', () => {
    const now = 1700000000000; // Fixed timestamp in ms
    Date.now = vi.fn().mockReturnValue(now);

    // Token expires at now + 120 seconds
    const expSeconds = Math.floor(now / 1000) + 120;
    const token = createToken(expSeconds);

    // Leeway is 60 seconds, 120 - 60 = 60 seconds remaining
    expect(isTokenExpiringSoon(token, 60)).toBe(false);
  });

  it('should handle zero leeway', () => {
    const now = 1700000000000;
    Date.now = vi.fn().mockReturnValue(now);

    // Token expires at now + 10 seconds
    const expSeconds = Math.floor(now / 1000) + 10;
    const token = createToken(expSeconds);

    expect(isTokenExpiringSoon(token, 0)).toBe(false);
  });

  it('should return true for token that just expired', () => {
    const now = 1700000000000;
    Date.now = vi.fn().mockReturnValue(now);

    // Token expired 1 second ago
    const expSeconds = Math.floor(now / 1000) - 1;
    const token = createToken(expSeconds);

    expect(isTokenExpiringSoon(token, 60)).toBe(true);
  });
});
