import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 后台管理员 / 第三方用户实体
 *
 * 表名: b_3rd_users
 * 密码签名: 使用 argon2，hash 值直接存 password_hash（自带 salt，无需单独 password_salt 列）
 */
@Entity({ name: 'b_3rd_users', comment: '第三方用户表' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid', { comment: '用户 ID' })
  id: string;

  @Index({ unique: true })
  @Column({ name: 'username', type: 'varchar', length: 64, comment: '用户名' })
  username: string;

  @Index({ unique: true })
  @Column({
    name: 'email',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '邮箱',
  })
  email: string | null;

  /**
   * argon2 hash（以 $argon2id$v=19$m=... 格式存储，内部已包含 salt）
   */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, comment: 'argon2 密码哈希' })
  passwordHash: string;

  /**
   * 绑定的 Shopify 店铺域名（可选，便于按店铺隔离查询）
   */
  @Index()
  @Column({
    name: 'shop',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '绑定的 Shopify 店铺域名',
  })
  shop: string | null;

  @Column({
    name: 'role',
    type: 'varchar',
    length: 20,
    default: 'user',
    comment: '角色: admin / user',
  })
  role: 'admin' | 'user';

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'active',
    comment: '状态: active / inactive / banned',
  })
  status: 'active' | 'inactive' | 'banned';

  @Column({ name: 'is_active', type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: number;

  @CreateDateColumn({ name: 'created_time', type: 'datetime', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'modified_time', type: 'datetime', comment: '更新时间' })
  updatedAt: Date;

  @Column({ name: 'created_user', type: 'varchar', default: '', length: 255, nullable: true, comment: '创建用户' })
  createdUser: string | null;
  
  @Column({ name: 'modified_user', type: 'varchar', default: '', length: 255, nullable: true, comment: '更新用户' })
  modifiedUser: string | null;

  @Column({
    name: 'last_login_time',
    type: 'datetime',
    nullable: true,
    comment: '最近一次登录时间',
  })
  lastLoginAt: Date | null;
}
