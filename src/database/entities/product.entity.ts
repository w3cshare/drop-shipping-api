import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Shopify 商品实体
 *
 * 存储来自 Shopify Webhook 的商品（Product）数据
 */
@Entity({ name: 'b_3rd_products', comment: 'Shopify 商品表 - 存储来自 Shopify Webhook 的商品数据' })
export class ShopProductEntity {
  /** Shopify 商品 ID */
  @PrimaryColumn({ type: 'bigint', comment: 'Shopify 商品 ID' })
  id: string;

  /** 店铺域名 */
  @Index()
  @Column({ name: 'shop', type: 'varchar', length: 255, comment: '店铺域名' })
  shop: string;

  /** 商品标题 */
  @Column({ name: 'title', type: 'varchar', length: 500, comment: '商品标题' })
  title: string;

  /** URL slug */
  @Column({ name: 'handle', type: 'varchar', length: 500, nullable: true, comment: 'URL slug' })
  handle: string;

  /** 商品描述（HTML） */
  @Column({ name: 'description', type: 'text', nullable: true, comment: '商品描述（HTML）' })
  description: string;

  /** 供应商 */
  @Column({ name: 'vendor', type: 'varchar', length: 255, nullable: true, comment: '供应商' })
  vendor: string;

  /** 商品类型 */
  @Column({ name: 'product_type', type: 'varchar', length: 255, nullable: true, comment: '商品类型' })
  productType: string;

  /** 商品状态：active / draft / archived / submitted */
  @Column({ name: 'status', type: 'varchar', length: 50, comment: '商品状态' })
  status: string;

  /** 标签（逗号分隔存储） */
  @Column({ name: 'tags', type: 'varchar', length: 1000, nullable: true, comment: '标签' })
  tags: string;

  @Column({ name: 'is_active', type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: number;

  /** Shopify 创建时间 */
  @CreateDateColumn({ name: 'created_time', type: 'datetime', comment: 'Shopify 创建时间' })
  createdAt: Date;

  /** Shopify 更新时间 */
  @UpdateDateColumn({ name: 'modified_time', type: 'datetime', comment: 'Shopify 更新时间' })
  updatedAt: Date;

  @Column({ name: 'created_user', type: 'varchar', default: '', length: 255, nullable: true, comment: '创建用户' })
  createdUser: string | null;
  
  @Column({ name: 'modified_user', type: 'varchar', default: '', length: 255, nullable: true, comment: '更新用户' })
  modifiedUser: string | null;

  /** 商品图片（JSON 格式存储） */
  @Column({ name: 'images', type: 'text', nullable: true, comment: '商品图片（JSON 格式）' })
  images: string;

  /** 变体列表（JSON 格式存储） */
  @Column({ name: 'variants', type: 'text', nullable: true, comment: '变体列表（JSON 格式）' })
  variants: string;

  /** 选项配置（JSON 格式存储） */
  @Column({ name: 'options', type: 'text', nullable: true, comment: '选项配置（JSON 格式）' })
  options: string;

  /** 数据库创建时间 */
  @CreateDateColumn({ name: 'db_created_time', type: 'datetime', comment: '数据库创建时间' })
  dbCreatedAt: Date;

  /** 数据库更新时间 */
  @UpdateDateColumn({ name: 'db_modified_time', type: 'datetime', comment: '数据库更新时间' })
  dbUpdatedAt: Date;
}
