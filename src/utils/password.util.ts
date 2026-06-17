import * as argon2 from 'argon2';

/**
 * 密码工具：使用 argon2id 进行哈希与验证
 *
 * argon2 内部已包含 salt，生成结果格式为:
 *   $argon2id$v=19$m=65536,t=3,p=4$<base64_salt>$<base64_hash>
 * 因此数据库只需一个 password_hash 字段即可。
 */

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * 检查 hash 是否是老格式（如 PBKDF2 明文 hex），便于将来做迁移判断。
 * argon2 始终以 $argon2 开头，非此字符串即视为旧格式。
 */
export function isArgon2Hash(hash: string | undefined | null): boolean {
  return typeof hash === 'string' && hash.startsWith('$argon2');
}
