import * as crypto from 'crypto';

/**
 * 密码工具：使用 Node 内置 crypto 的 PBKDF2 进行哈希与验证
 */

const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';
const SALT_LEN = 32;

export function generateSalt(): string {
  return crypto.randomBytes(SALT_LEN).toString('hex');
}

export function hashPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST)
    .toString('hex');
}

export function verifyPassword(
  password: string,
  salt: string,
  hash: string,
): boolean {
  const computed = hashPassword(password, salt);
  return crypto.timingSafeEqual(
    Buffer.from(computed, 'hex'),
    Buffer.from(hash, 'hex'),
  );
}
