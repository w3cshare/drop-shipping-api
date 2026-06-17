import { Entity, Unique, PrimaryGeneratedColumn, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Shopify 订单实体
 *
 * 存储来自 Shopify Webhook 的订单数据
 */
@Entity({ name: 'b_3rd_orders', comment: 'Shopify 订单表 - 存储来自 Shopify Webhook 的订单数据' })
@Unique(['orderId', 'shop'])
export class ShopOrderEntity {
  /** 自增 ID */
  @PrimaryGeneratedColumn({ name: 'id', comment: '自增 ID' })
  id: number;

  /** Shopify 订单 ID */
  @Index()
  @Column({ name: 'order_id', type: 'bigint', comment: 'Shopify 订单 ID' })
  orderId: string;

  /** 店铺域名 */
  @Index()
  @Column({ name: 'shop', type: 'varchar', length: 255, comment: '店铺域名' })
  shop: string;

  /** 订单名称（如 #1001） */
  @Column({ name: 'name', type: 'varchar', length: 100, comment: '订单名称' })
  name: string;

  /** 订单状态 */
  @Column({ name: 'status', type: 'varchar', length: 50, comment: '订单状态' })
  status: string;
  
  /** 订单状态 URL */
  @Column({ name: 'order_status_url', type: 'varchar', length: 255, nullable: true, comment: '订单状态 URL' })
  orderStatusUrl: string;
  
  /** 订单来源名称 */
  @Column({ name: 'source_name', type: 'varchar', length: 50, default: '', comment: '订单来源名称' })
  sourceName: string;

  /** 客户信息（JSON 格式存储） */
  @Column({ name: 'customer', type: 'text', nullable: true, comment: '客户信息（JSON 格式存储）' })
  customer: string;

  /** 财务状态 */
  @Column({ name: 'financial_status', type: 'varchar', length: 50, comment: '财务状态' })
  financialStatus: string;

  /** 配送状态 */
  @Column({ name: 'fulfillment_status', type: 'varchar', length: 50, comment: '配送状态' })
  fulfillmentStatus: string;

  /** 订单总额（JSON 格式存储） */
  @Column({ name: 'total_price_set', type: 'text', comment: '订单总额（JSON 格式存储）' })
  totalPriceSet: string;

  /** 订单小计 */
  @Column({ name: 'subtotal_price_set', type: 'text', comment: '订单小计（JSON 格式存储）' })
  subtotalPriceSet: string;

  /** 运费 */
  @Column({ name: 'shipping_price_set', type: 'text', comment: '运费（JSON 格式存储）' })
  shippingPriceSet: string;

  /** 税费 */
  @Column({ name: 'total_tax_set', type: 'text', comment: '税费（JSON 格式存储）' })
  totalTaxSet: string;

  @Column({ name: 'is_active', type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: number;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_time', type: 'datetime', comment: '创建时间' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'modified_time', type: 'datetime', comment: '更新时间' })
  updatedAt: Date;

  @Column({ name: 'created_user', type: 'varchar', default: '', length: 255, nullable: true, comment: '创建用户' })
  createdUser: string | null;
  
  @Column({ name: 'modified_user', type: 'varchar', default: '', length: 255, nullable: true, comment: '更新用户' })
  modifiedUser: string | null;

  /** 支付网关 */
  @Column({ name: 'payment_gateway_names', type: 'varchar', length: 100, nullable: true, comment: '支付网关' })
  paymentGatewayNames: string;

  /** 行项目数据（JSON 格式） */
  @Column({ name: 'line_items', type: 'text', nullable: true, comment: '行项目数据（JSON 格式）' })
  lineItems: string;

  /** 配送地址（JSON 格式） */
  @Column({ name: 'shipping_address', type: 'text', nullable: true, comment: '配送地址（JSON 格式）' })
  shippingAddress: string;

  /** 账单地址（JSON 格式） */
  @Column({ name: 'billing_address', type: 'text', nullable: true, comment: '账单地址（JSON 格式）' })
  billingAddress: string;

  /** 是否退款 */
  @Column({ name: 'refunded', type: 'boolean', default: false, comment: '是否退款' })
  refunded: boolean;

  /** 退款金额（JSON 格式） */
  @Column({ name: 'total_refunded_set', type: 'text', nullable: true, comment: '退款金额（JSON 格式）' })
  totalRefundedSet: string;

  /** 订单来源类型 */
  @Column({ name: 'type', type: 'varchar', length: 50, default: 'shopify', comment: '订单来源类型' })
  orderType: string;

  /** 数据库创建时间 */
  @CreateDateColumn({ name: 'db_created_time', type: 'datetime', comment: '数据库创建时间' })
  dbCreatedAt: Date;

  /** 数据库更新时间 */
  @UpdateDateColumn({ name: 'db_modified_time', type: 'datetime', comment: '数据库更新时间' })
  dbUpdatedAt: Date;
}
