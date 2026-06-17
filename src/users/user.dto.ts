/**
 * 用户相关 DTO
 */

export interface CreateUserDto {
  username: string;
  email?: string;
  password: string;
  role?: 'admin' | 'user';
  shop?: string;
}

export interface LoginUserDto {
  username: string;
  password: string;
}

export interface ChangePasswordDto {
  password: string;
  newPassword: string;
}

export interface UserResponseDto {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'inactive' | 'banned';
  shop: string | null;
  createdTime: string;
  lastLoginTime: string | null;
}

/**
 * 构造响应对象，始终剔除 passwordHash 等敏感字段
 */
export function toUserResponse(user: {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'inactive' | 'banned';
  shop: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}): UserResponseDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    shop: user.shop,
    createdTime: user.createdAt ? user.createdAt.toISOString() : '',
    lastLoginTime: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
