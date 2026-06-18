import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { ShopOrderEntity } from '../database/entities/order.entity';
import {
  OrderFiltersDto,
  PaginatedOrdersResponseDto,
  OrderStatsDto,
  OrderResponseDto,
  safeParseJson,
} from './order.dto';

/**
 * 订单服务
 * 
 * 处理 Shopify 订单的存储、查询和更新
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(ShopOrderEntity)
    private readonly orderRepository: Repository<ShopOrderEntity>,
  ) {}

  /**
   * 保存或更新订单（使用 upsert，基于 orderId + shop 唯一约束）
   */
  async saveOrder(shop: string, orderData: any): Promise<ShopOrderEntity> {
    try {
      const orderId = String(orderData.id);

      const order = new ShopOrderEntity();

      // 基础信息
      order.orderId = orderId;
      order.shop = shop;
      order.name = orderData.name;
      order.orderStatusUrl = orderData.order_status_url;
      order.sourceName = orderData.source_name || '';
      order.status = orderData.status || 'open';
      order.financialStatus = orderData.financial_status || orderData.financialStatus || 'pending';
      order.fulfillmentStatus = orderData.fulfillment_status || orderData.fulfillmentStatus || 'unfulfilled';

      // 客户信息（JSON 格式存储）
      order.customer = JSON.stringify(orderData.customer || {});

      // 金额信息（JSON 格式存储）
      order.totalPriceSet = JSON.stringify(orderData.total_price_set || orderData.totalPriceSet || orderData.currentTotalPriceSet || {});
      order.subtotalPriceSet = JSON.stringify(orderData.subtotal_price_set || orderData.subtotalPriceSet || {});
      order.shippingPriceSet = JSON.stringify(orderData.total_shipping_price_set || orderData.totalShippingPriceSet || {});
      order.totalTaxSet = JSON.stringify(orderData.total_tax_set || orderData.totalTaxSet || {});

      // 时间信息
      order.createdAt = orderData.created_at ? new Date(orderData.created_at) : new Date();
      order.updatedAt = orderData.updated_at ? new Date(orderData.updated_at) : new Date();

      // 支付信息
      if (orderData.payment_gateway_names) {
        order.paymentGatewayNames = Array.isArray(orderData.payment_gateway_names)
          ? orderData.payment_gateway_names.join(',')
          : orderData.payment_gateway_names;
      }

      // 行项目
      if (orderData.line_items || orderData.lineItems) {
        order.lineItems = JSON.stringify(orderData.line_items || orderData.lineItems || []);
      }

      // 地址信息
      if (orderData.shipping_address || orderData.shippingAddress) {
        order.shippingAddress = JSON.stringify(orderData.shipping_address || orderData.shippingAddress || {});
      }
      if (orderData.billing_address || orderData.billingAddress) {
        order.billingAddress = JSON.stringify(orderData.billing_address || orderData.billingAddress || {});
      }

      // 退款信息
      order.refunded = !!orderData.refunded_amount || !!orderData.total_refunded;
      if (orderData.total_refunded_set || orderData.totalRefundedSet) {
        order.totalRefundedSet = JSON.stringify(orderData.total_refunded_set || orderData.totalRefundedSet || {});
      }

      // 使用 upsert 原子操作，避免 findOne + save 导致的竞态条件和重复
      await this.orderRepository.upsert(order, {
        conflictPaths: ['orderId', 'shop'],
        skipUpdateIfNoValuesChanged: true,
      });

      const savedOrder = await this.orderRepository.findOne({ where: { orderId, shop } });
      this.logger.log(`Order ${orderId} saved for shop ${shop}`);
      return savedOrder!;
    } catch (error: any) {
      this.logger.error(`Failed to save order: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取店铺的订单列表
   */
  async getOrdersByShop(shop: string, limit: number = 20, offset: number = 0): Promise<ShopOrderEntity[]> {
    return this.orderRepository.find({
      where: { shop },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * 获取订单数量
   */
  async getOrderCount(shop: string): Promise<number> {
    return this.orderRepository.count({ where: { shop } });
  }

  /**
   * 删除订单
   */
  async deleteOrder(shop: string, orderId: string): Promise<void> {
    await this.orderRepository.delete({ orderId: orderId, shop });
    this.logger.log(`Order ${orderId} deleted for shop ${shop}`);
  }

  /**
   * 删除店铺的所有订单
   */
  async deleteOrdersByShop(shop: string): Promise<void> {
    await this.orderRepository.delete({ shop });
    this.logger.log(`All orders deleted for shop ${shop}`);
  }

  /**
   * 查询订单（支持过滤）
   */
  async searchOrders(
    shop: string,
    filters: {
      status?: string;
      financialStatus?: string;
      fulfillmentStatus?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit: number = 20,
    offset: number = 0,
  ): Promise<ShopOrderEntity[]> {
    const query = this.orderRepository.createQueryBuilder('order')
      .where('order.shop = :shop', { shop });

    if (filters.status) {
      query.andWhere('order.status = :status', { status: filters.status });
    }
    if (filters.financialStatus) {
      query.andWhere('order.financialStatus = :financialStatus', { financialStatus: filters.financialStatus });
    }
    if (filters.fulfillmentStatus) {
      query.andWhere('order.fulfillmentStatus = :fulfillmentStatus', { fulfillmentStatus: filters.fulfillmentStatus });
    }
    if (filters.startDate) {
      query.andWhere('order.createdAt >= :startDate', { startDate: filters.startDate });
    }
    if (filters.endDate) {
      query.andWhere('order.createdAt <= :endDate', { endDate: filters.endDate });
    }

    return query
      .orderBy('order.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getMany();
  }

  /**
   * 构建订单基础查询（共享给列表/详情/计数）
   *
   * 使用 LEFT JOIN b_3rd_shops 把店铺信息在一条 SQL 内返回，
   * 避免 N+1 查询与 Controller 层二次遍历回填。
   */
  private buildOrderBaseQuery(shop: string, filters: OrderFiltersDto = {}) {
    const qb = this.orderRepository
      .createQueryBuilder('o')
      .leftJoin('b_3rd_shops', 's', 's.shop = o.shop')
      .where('o.shop = :shop', { shop });

    if (filters.status) {
      qb.andWhere('o.status = :status', { status: filters.status });
    }
    if (filters.financialStatus) {
      qb.andWhere('o.financial_status = :financialStatus', { financialStatus: filters.financialStatus });
    }
    if (filters.fulfillmentStatus) {
      qb.andWhere('o.fulfillment_status = :fulfillmentStatus', { fulfillmentStatus: filters.fulfillmentStatus });
    }
    if (filters.startDate) {
      qb.andWhere('o.created_time >= :startDate', { startDate: filters.startDate });
    }
    if (filters.endDate) {
      qb.andWhere('o.created_time <= :endDate', { endDate: filters.endDate });
    }
    if (filters.keyword) {
      const kw = `%${filters.keyword}%`;
      qb.andWhere(
        new Brackets((qb) => {
          qb.where('o.name LIKE :kw', { kw }).orWhere('o.order_id LIKE :kw', { kw });
        }),
      );
    }

    return qb;
  }

  /**
   * 分页查询订单（LEFT JOIN 店铺表，一条 SQL 返回订单+店铺信息）
   *
   * @param shop  店铺域名
   * @param page  页码，从 1 开始
   * @param pageSize 每页数量
   * @param filters 过滤条件
   */
  async findOrdersWithPagination(
    shop: string,
    page: number = 1,
    pageSize: number = 20,
    filters: OrderFiltersDto = {},
  ): Promise<PaginatedOrdersResponseDto> {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const offset = (safePage - 1) * safePageSize;

    const listQb = this.buildOrderBaseQuery(shop, filters)
      .select([
        'o.id AS o_id',
        'o.order_id AS o_order_id',
        'o.name AS o_name',
        'o.shop AS o_shop',
        'o.status AS o_status',
        'o.order_status_url AS o_order_status_url',
        'o.source_name AS o_source_name',
        'o.customer AS o_customer',
        'o.financial_status AS o_financial_status',
        'o.fulfillment_status AS o_fulfillment_status',
        'o.total_price_set AS o_total_price_set',
        'o.subtotal_price_set AS o_subtotal_price_set',
        'o.shipping_price_set AS o_shipping_price_set',
        'o.total_tax_set AS o_total_tax_set',
        'o.total_refunded_set AS o_total_refunded_set',
        'o.refunded AS o_refunded',
        'o.payment_gateway_names AS o_payment_gateway_names',
        'o.line_items AS o_line_items',
        'o.shipping_address AS o_shipping_address',
        'o.billing_address AS o_billing_address',
        'o.type AS o_type',
        'o.created_time AS o_created_time',
        'o.modified_time AS o_modified_time',
        'o.db_created_time AS o_db_created_time',
        'o.db_modified_time AS o_db_modified_time',
        's.name AS s_name',
        's.email AS s_email',
        's.domain AS s_domain',
        's.currency_code AS s_currency_code',
        's.country_code AS s_country_code',
      ])
      .orderBy('o.created_time', 'DESC')
      .limit(safePageSize)
      .offset(offset);

    const countQb = this.buildOrderBaseQuery(shop, filters);

    const [rawList, total] = await Promise.all([listQb.getRawMany(), countQb.getCount()]);

    const items = rawList.map((row: any) =>
      this.toResponseDto(
        {
          id: row.o_id,
          orderId: row.o_order_id,
          name: row.o_name,
          shop: row.o_shop,
          status: row.o_status,
          orderStatusUrl: row.o_order_status_url,
          sourceName: row.o_source_name,
          customer: row.o_customer,
          financialStatus: row.o_financial_status,
          fulfillmentStatus: row.o_fulfillment_status,
          totalPriceSet: row.o_total_price_set,
          subtotalPriceSet: row.o_subtotal_price_set,
          shippingPriceSet: row.o_shipping_price_set,
          totalTaxSet: row.o_total_tax_set,
          totalRefundedSet: row.o_total_refunded_set,
          refunded: row.o_refunded === 1 || row.o_refunded === true,
          paymentGatewayNames: row.o_payment_gateway_names,
          lineItems: row.o_line_items,
          shippingAddress: row.o_shipping_address,
          billingAddress: row.o_billing_address,
          orderType: row.o_type,
          createdAt: row.o_created_time,
          updatedAt: row.o_modified_time,
          dbCreatedAt: row.o_db_created_time,
          dbUpdatedAt: row.o_db_modified_time,
        } as ShopOrderEntity,
        {
          name: row.s_name ?? null,
          email: row.s_email ?? null,
          domain: row.s_domain ?? null,
          currency_code: row.s_currency_code ?? null,
          country_code: row.s_country_code ?? null,
        },
      ),
    );

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  /**
   * 按订单 ID 获取一条（LEFT JOIN 店铺表，含 shop 隔离）
   */
  async findOrderById(shop: string, orderId: string): Promise<OrderResponseDto | null> {
    const row = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoin('b_3rd_shops', 's', 's.shop = o.shop')
      .where('o.shop = :shop', { shop })
      .andWhere('o.order_id = :orderId', { orderId })
      .select([
        'o.id AS o_id',
        'o.order_id AS o_order_id',
        'o.name AS o_name',
        'o.shop AS o_shop',
        'o.status AS o_status',
        'o.order_status_url AS o_order_status_url',
        'o.source_name AS o_source_name',
        'o.customer AS o_customer',
        'o.financial_status AS o_financial_status',
        'o.fulfillment_status AS o_fulfillment_status',
        'o.total_price_set AS o_total_price_set',
        'o.subtotal_price_set AS o_subtotal_price_set',
        'o.shipping_price_set AS o_shipping_price_set',
        'o.total_tax_set AS o_total_tax_set',
        'o.total_refunded_set AS o_total_refunded_set',
        'o.refunded AS o_refunded',
        'o.payment_gateway_names AS o_payment_gateway_names',
        'o.line_items AS o_line_items',
        'o.shipping_address AS o_shipping_address',
        'o.billing_address AS o_billing_address',
        'o.type AS o_type',
        'o.created_time AS o_created_time',
        'o.modified_time AS o_modified_time',
        'o.db_created_time AS o_db_created_time',
        'o.db_modified_time AS o_db_modified_time',
        's.name AS s_name',
        's.email AS s_email',
        's.domain AS s_domain',
        's.currency_code AS s_currency_code',
        's.country_code AS s_country_code',
      ])
      .getRawOne();

    if (!row) return null;

    return this.toResponseDto(
      {
        id: row.o_id,
        orderId: row.o_order_id,
        name: row.o_name,
        shop: row.o_shop,
        status: row.o_status,
        orderStatusUrl: row.o_order_status_url,
        sourceName: row.o_source_name,
        customer: row.o_customer,
        financialStatus: row.o_financial_status,
        fulfillmentStatus: row.o_fulfillment_status,
        totalPriceSet: row.o_total_price_set,
        subtotalPriceSet: row.o_subtotal_price_set,
        shippingPriceSet: row.o_shipping_price_set,
        totalTaxSet: row.o_total_tax_set,
        totalRefundedSet: row.o_total_refunded_set,
        refunded: row.o_refunded === 1 || row.o_refunded === true,
        paymentGatewayNames: row.o_payment_gateway_names,
        lineItems: row.o_line_items,
        shippingAddress: row.o_shipping_address,
        billingAddress: row.o_billing_address,
        orderType: row.o_type,
        createdAt: row.o_created_time,
        updatedAt: row.o_modified_time,
        dbCreatedAt: row.o_db_created_time,
        dbUpdatedAt: row.o_db_modified_time,
      } as ShopOrderEntity,
      {
        name: row.s_name ?? null,
        email: row.s_email ?? null,
        domain: row.s_domain ?? null,
        currency_code: row.s_currency_code ?? null,
        country_code: row.s_country_code ?? null,
      },
    );
  }

  /**
   * 订单基础统计
   */
  async getOrderStats(
    shop: string,
    filters: { startDate?: Date; endDate?: Date } = {},
  ): Promise<OrderStatsDto> {
    const query = this.orderRepository.createQueryBuilder('o').where('o.shop = :shop', { shop });
    if (filters.startDate) query.andWhere('o.created_time >= :startDate', { startDate: filters.startDate });
    if (filters.endDate) query.andWhere('o.created_time <= :endDate', { endDate: filters.endDate });

    const all = await query.getMany();

    const byStatus: Record<string, number> = {};
    const byFinancialStatus: Record<string, number> = {};
    let totalAmountDecimal = 0;

    for (const o of all) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      byFinancialStatus[o.financialStatus] = (byFinancialStatus[o.financialStatus] || 0) + 1;
      try {
        const p = JSON.parse(o.totalPriceSet || '{}');
        const amt = parseFloat(p?.shopMoney?.amount || p?.presentmentMoney?.amount || 0);
        if (!Number.isNaN(amt)) totalAmountDecimal += amt;
      } catch {
        /* ignore */
      }
    }

    return {
      totalCount: all.length,
      totalAmount: totalAmountDecimal.toFixed(2),
      byStatus,
      byFinancialStatus,
    };
  }

  /**
   * 将数据库实体转换为对外响应 DTO
   * 主要工作：解析 text 字段中存储的 JSON
   */
  toResponseDto(order: ShopOrderEntity, shopInfo?: {
    name: string | null;
    email: string | null;
    domain: string | null;
    currency_code: string | null;
    country_code: string | null;
  } | null): OrderResponseDto {
    return {
      id: order.id,
      order_id: order.orderId,
      name: order.name,
      shop: order.shop,
      shop_name: shopInfo?.name ?? null,
      shop_email: shopInfo?.email ?? null,
      shop_domain: shopInfo?.domain ?? null,
      shop_currency: shopInfo?.currency_code ?? null,
      status: order.status,
      order_status_url: order.orderStatusUrl,
      source_name: order.sourceName,
      customer: safeParseJson(order.customer),
      financial_status: order.financialStatus,
      fulfillment_status: order.fulfillmentStatus,
      total_price_set: safeParseJson(order.totalPriceSet),
      subtotal_price_set: safeParseJson(order.subtotalPriceSet),
      shipping_price_set: safeParseJson(order.shippingPriceSet),
      total_tax_set: safeParseJson(order.totalTaxSet),
      total_refunded_set: safeParseJson(order.totalRefundedSet),
      refunded: order.refunded,
      payment_gateway_names: order.paymentGatewayNames ? order.paymentGatewayNames.split(',') : [],
      line_items: safeParseJson(order.lineItems) as Record<string, any>[] | null,
      shipping_address: safeParseJson(order.shippingAddress),
      billing_address: safeParseJson(order.billingAddress),
      type: order.orderType,
      created_at: order.createdAt?.toISOString() ?? null,
      updated_at: order.updatedAt?.toISOString() ?? null,
      db_created_at: order.dbCreatedAt?.toISOString() ?? null,
      db_updated_at: order.dbUpdatedAt?.toISOString() ?? null,
    };
  }
}