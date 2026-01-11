import { randomBytes } from 'crypto';

export function generateRandomPassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}
