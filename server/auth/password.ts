import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/* scrypt, N=2^15 r=8 p=1, 16-byte salt, 32-byte key. Stored as
   scrypt$N$salt$hash so the parameters can change later without a migration. */
const N = 1 << 15;
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize('NFKC'), salt, 32, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [algo, nStr, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const n = Number(nStr);
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const key = scryptSync(password.normalize('NFKC'), salt, expected.length, { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const HANDLE = /^[a-z0-9_]{3,20}$/i;
export function validatePassword(p: string): string | null {
  if (typeof p !== 'string' || p.length < 8) return 'Use at least 8 characters for the password.';
  if (p.length > 256) return 'That password is too long.';
  return null;
}
