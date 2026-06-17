import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Shopify Session 存储实体
 *
 * 用于存储 OAuth 认证后的会话信息，包括：
 * - Online Token: 用于前端嵌入式应用的短期会话
 * - Offline Token: 用于后台任务的长期令牌
 *
 * Shopify 2026年4月新规：离线令牌支持自动刷新
 */
@Entity({ name: 'b_3rd_sessions', comment: 'Shopify 会话表 - 存储 OAuth 认证后的会话信息' })
export class ShopSessionEntity {
  @PrimaryGeneratedColumn('uuid', { comment: '会话 ID' })
  id: string;

  @Index()
  @Column({ name: 'shop', type: 'varchar', length: 255, comment: '店铺域名' })
  shop: string;

  @Column({ name: 'state', type: 'varchar', length: 255, nullable: true, comment: '会话状态' })
  state: string;

  @Column({ name: 'scope', type: 'text', nullable: true, comment: '权限范围' })
  scope: string;

  @Column({ name: 'access_token', type: 'text', nullable: true, comment: '访问令牌' })
  accessToken: string;

  @Column({ name: 'expires_time', type: 'datetime', nullable: true, comment: '过期时间' })
  expiresAt: Date | null;

  /**
   * 在线访问信息（仅 Online Session）
   * 包含：expires_in, access_token, associated_user_scope, associated_user 等
   */
  @Column({ name: 'online_access_info', type: 'text', nullable: true, comment: '在线访问信息' })
  onlineAccessInfo: Record<string, any> | null;

  /**
   * 会话类型标识
   * - 'online': 前端嵌入式应用会话
   * - 'offline': 后台任务使用的长期令牌
   */
  @Column({ name: 'session_type', type: 'varchar', length: 20, default: 'offline', comment: '会话类型' })
  sessionType: 'online' | 'offline';

  @Column({ name: 'is_active', type: 'tinyint', length: 1, default: 1, comment: '是否启用' })
  isActive: number;

  @CreateDateColumn({ name: 'created_time', type: 'datetime', default: () => 'CURRENT_TIMESTAMP', comment: '创建时间' })
  createdAt: Date;

  @Column({ name: 'modified_time', type: 'datetime', default: () => 'CURRENT_TIMESTAMP', comment: '更新时间' })
  updatedAt: Date;

  @Column({ name: 'created_user', type: 'varchar', default: '', length: 255, nullable: true, comment: '创建用户' })
  createdUser: string | null;
  
  @Column({ name: 'modified_user', type: 'varchar', default: '', length: 255, nullable: true, comment: '更新用户' })
  modifiedUser: string | null;
}
