import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 店铺信息缓存表
 *
 * 存储 Shopify 店铺的基本信息，用于：
 * - 订单 / 商品列表中展示店铺名称、域名等
 * - 独立应用模式下展示用户可管理的店铺
 * - 通过 Webhook (shop/update) 自动保持同步
 *
 * 表名: b_3rd_shops
 * 主键: shop (店铺域名，唯一)
 */
@Entity({ name: 'b_3rd_shops', comment: '店铺信息表 - 缓存 Shopify 店铺基本信息' })
export class ShopEntity {
  @PrimaryGeneratedColumn('uuid', { comment: '店铺 ID（内部主键）' })
  id: string;

  /**
   * Shopify 店铺域名 (xxx.myshopify.com) — 业务唯一键
   */
  @Index({ unique: true })
  @Column({ name: 'shop', type: 'varchar', length: 255, comment: 'Shopify 店铺域名（唯一）' })
  shop: string;

  /**
   * Shopify 原始店铺 ID（可选）
   */
  @Index()
  @Column({
    name: 'shopify_id',
    type: 'bigint',
    nullable: true,
    comment: 'Shopify 原始店铺 ID',
  })
  shopifyId: string | null;

  /**
   * 店铺名称（对外展示用）
   */
  @Column({
    name: 'name',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '店铺名称',
  })
  name: string | null;

  /**
   * 店铺联系邮箱
   */
  @Column({
    name: 'email',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '店铺联系邮箱',
  })
  email: string | null;

  /**
   * 店铺主域名（可能非 myshopify.com）
   */
  @Column({
    name: 'domain',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '店铺主域名',
  })
  domain: string | null;

  /**
   * 货币代码（如 CNY / USD）
   */
  @Column({
    name: 'currency_code',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '货币代码（如 CNY/USD）',
  })
  currencyCode: string | null;

  /**
   * 时区（如 Asia/Shanghai）
   */
  @Column({
    name: 'iana_timezone',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: 'IANA 时区（如 Asia/Shanghai）',
  })
  ianaTimezone: string | null;

  /**
   * 国家代码（如 CN）
   */
  @Column({
    name: 'country_code',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '国家代码（如 CN）',
  })
  countryCode: string | null;

  /**
   * 省份 / 州
   */
  @Column({
    name: 'province',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '省份 / 州',
  })
  province: string | null;

  /**
   * 城市
   */
  @Column({
    name: 'city',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '城市',
  })
  city: string | null;

  /**
   * 详细地址
   */
  @Column({
    name: 'address1',
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '详细地址',
  })
  address1: string | null;

  /**
   * 邮政编码
   */
  @Column({
    name: 'zip',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '邮政编码',
  })
  zip: string | null;

  /**
   * 电话
   */
  @Column({
    name: 'phone',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '电话',
  })
  phone: string | null;

  /**
   * 当前应用在该店铺的权限范围（OAuth scope）
   */
  @Column({
    name: 'scope',
    type: 'text',
    nullable: true,
    comment: '当前应用的权限范围（OAuth scope）',
  })
  scope: string | null;

  /**
   * 店铺在该应用下是否启用
   */
  @Column({
    name: 'is_active',
    type: 'tinyint',
    default: 1,
    comment: '该店铺是否在应用中启用',
  })
  isActive: number;

  /**
   * Shopify 侧店铺最后更新时间（来自 shop/update 或 shop.json）
   */
  @Column({
    name: 'shopify_updated_at',
    type: 'datetime',
    nullable: true,
    comment: 'Shopify 侧店铺最后更新时间',
  })
  shopifyUpdatedAt: Date | null;

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
