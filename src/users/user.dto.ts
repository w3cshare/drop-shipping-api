import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * User-related DTOs
 */

export class CreateUserDto {
  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiPropertyOptional({ description: '邮箱地址' })
  email?: string;

  @ApiProperty({ description: '密码' })
  password: string;

  @ApiPropertyOptional({ description: '角色', enum: ['admin', 'user'] })
  role?: 'admin' | 'user';

  @ApiPropertyOptional({ description: '店铺标识' })
  shop?: string;
}

export class LoginUserDto {
  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '密码' })
  password: string;
}

export class RegisterDto {
  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiPropertyOptional({ description: '邮箱地址' })
  email?: string;

  @ApiProperty({ description: '密码' })
  password: string;

  @ApiPropertyOptional({ description: '店铺标识' })
  shop?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码' })
  password: string;

  @ApiProperty({ description: '新密码' })
  newPassword: string;
}

export class UserResponseDto {
  @ApiProperty({ description: '用户ID' })
  id: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '邮箱地址', nullable: true })
  email: string | null;

  @ApiProperty({ description: '角色', enum: ['admin', 'user'] })
  role: 'admin' | 'user';

  @ApiProperty({ description: '账号状态', enum: ['active', 'inactive', 'banned'] })
  status: 'active' | 'inactive' | 'banned';

  @ApiProperty({ description: '店铺标识', nullable: true })
  shop: string | null;

  @ApiProperty({ description: '创建时间' })
  createdTime: string;

  @ApiProperty({ description: '最后登录时间', nullable: true })
  lastLoginTime: string | null;
}

/**
 * Builds a safe response object, always stripping passwordHash and other sensitive fields
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