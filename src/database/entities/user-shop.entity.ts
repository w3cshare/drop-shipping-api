import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 用户 - 店铺 多对多 关联表
 *
 * 允许一个用户管理多个店铺（一对多：用户 → 多店铺）
 * 同时允许一个店铺被多个用户管理（多对一：店铺 → 多用户）
 *
 * 表名: b_3rd_user_shops
 */
@Entity({ name: 'b_3rd_user_shops', comment: '用户-店铺关联表（支持一个用户管理多个店铺）' })
@Index(['userId', 'shop'], { unique: true })
export class UserShopEntity {
  @PrimaryGeneratedColumn('uuid', { comment: '关联 ID' })
  id: string;

  /**
   * 用户 ID（对应 b_3rd_users.id）
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', length: 64, comment: '用户 ID' })
  userId: string;

  /**
   * 店铺域名（对应 b_3rd_shops.shop / b_3rd_sessions.shop）
   */
  @Index()
  @Column({ name: 'shop', type: 'varchar', length: 255, comment: '店铺域名' })
  shop: string;

  /**
   * 在该店铺下的角色 / 权限（如 owner / staff / viewer）
   */
  @Column({
    name: 'role',
    type: 'varchar',
    length: 32,
    default: 'staff',
    comment: '用户在该店铺中的角色：owner / staff / viewer',
  })
  role: 'owner' | 'staff' | 'viewer';

  /**
   * 该关联是否启用
   */
  @Column({
    name: 'is_active',
    type: 'tinyint',
    default: 1,
    comment: '该关联是否启用',
  })
  isActive: number;

  @CreateDateColumn({ name: 'created_time', type: 'datetime', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'modified_time', type: 'datetime', comment: '更新时间' })
  updatedAt: Date;

  @Column({
    name: 'created_user',
    type: 'varchar',
    default: '',
    length: 255,
    nullable: true,
    comment: '创建用户',
  })
  createdUser: string | null;

  @Column({
    name: 'modified_user',
    type: 'varchar',
    default: '',
    length: 255,
    nullable: true,
    comment: '更新用户',
  })
  modifiedUser: string | null;
}
