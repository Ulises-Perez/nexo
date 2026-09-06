// Cryptographically random invite codes (replaces Math.random-based codes).

import { randomBytes } from 'crypto';

// 6 random bytes -> 8 base64url chars, URL safe.
export function generateInviteCode(): string {
    return randomBytes(6).toString('base64url');
}
