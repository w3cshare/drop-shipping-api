import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserEntity } from '../database/entities/user.entity';
import { UserShopEntity } from '../database/entities/user-shop.entity';
import { ShopEntity } from '../database/entities/shop.entity';

export class CreateUserDto {
  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiPropertyOptional({ description: '邮箱地址' })
  email?: string;

  @ApiProperty({ description: '密码' })
  password: string;

  @ApiPropertyOptional({ description: '角色', enum: ['admin', 'user'] })
  role?: 'admin' | 'user';

  @ApiPropertyOptional({ description: '绑定的 Shopify 店铺域名' })
  shop?: string;
}

export class LoginUserDto {
  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '密码' })
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码' })
  password: string;

  @ApiProperty({ description: '新密码' })
  newPassword: string;
}

/**
 * 店铺列表项（对外返回的店铺信息）
 */
export class ShopInfoDto {
  @ApiProperty({ description: '店铺域名' })
  shop: string;

  @ApiPropertyOptional({ description: '店铺名称' })
  name: string | null;

  @ApiPropertyOptional({ description: '店铺邮箱' })
  email: string | null;

  @ApiPropertyOptional({ description: '主域名' })
  domain: string | null;

  @ApiPropertyOptional({ description: '货币代码' })
  currency_code: string | null;

  @ApiPropertyOptional({ description: '时区' })
  timezone: string | null;

  @ApiPropertyOptional({ description: '国家' })
  country_code: string | null;

  @ApiPropertyOptional({ description: '在当前应用下的权限范围' })
  scope: string | null;

  @ApiProperty({ description: '用户在该店铺中的角色（owner/staff/viewer）' })
  role: string;
}

export class UserResponseDto {
  @ApiProperty({ description: '用户ID' })
  id: string;

  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiPropertyOptional({ description: '邮箱地址', nullable: true })
  email: string | null;

  @ApiProperty({ description: '角色', enum: ['admin', 'user'] })
  role: 'admin' | 'user';

  @ApiProperty({ description: '账号状态', enum: ['active', 'inactive', 'banned'] })
  status: 'active' | 'inactive' | 'banned';

  @ApiPropertyOptional({ description: '绑定的 Shopify 店铺域名（兼容旧字段）', nullable: true })
  shop: string | null;

  @ApiPropertyOptional({ description: '该用户可管理的店铺列表（一对多）', type: [ShopInfoDto] })
  shops?: ShopInfoDto[];

  @ApiProperty({ description: '创建时间' })
  createdTime: string;

  @ApiPropertyOptional({ description: '最后登录时间', nullable: true })
  lastLoginTime: string | null;
}

/**
 * 构造对外返回的用户数据
 *
 * @param user 用户实体
 * @param shops 可选：该用户可管理的店铺列表（含 ShopEntity 信息）
 */
export function toUserResponse(
  user: UserEntity,
  shops?: Array<Omit<UserShopEntity, 'shop'> & { shop: ShopEntity }>,
): UserResponseDto {
  const shopInfoList: ShopInfoDto[] | undefined = shops?.map((us) => ({
    shop: us.shop.shop,
    name: us.shop.name,
    email: us.shop.email,
    domain: us.shop.domain,
    currency_code: us.shop.currencyCode,
    timezone: us.shop.ianaTimezone,
    country_code: us.shop.countryCode,
    scope: us.shop.scope,
    role: us.role,
  }));

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    shop: user.shop,
    shops: shopInfoList,
    createdTime: user.createdAt ? user.createdAt.toISOString() : '',
    lastLoginTime: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
