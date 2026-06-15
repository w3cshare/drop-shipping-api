import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopOrderEntity } from '../database/entities/order.entity';

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
   * 保存或更新订单
   */
  async saveOrder(shop: string, orderData: any): Promise<ShopOrderEntity> {
    try {
      const orderId = String(orderData.id);

      // 检查订单是否已存在
      const existingOrder = await this.orderRepository.findOne({
        where: { id: orderId, shop },
      });

      const order = existingOrder || new ShopOrderEntity();

      // 基础信息
      order.id = orderId;
      order.shop = shop;
      order.name = orderData.name;
      order.status = orderData.status || 'open';
      order.financialStatus = orderData.financial_status || orderData.financialStatus || 'pending';
      order.fulfillmentStatus = orderData.fulfillment_status || orderData.fulfillmentStatus || 'unfulfilled';

      // 金额信息（JSON 格式存储）
      order.totalPriceSet = JSON.stringify(orderData.total_price_set || orderData.totalPriceSet || {});
      order.subtotalPriceSet = JSON.stringify(orderData.subtotal_price_set || orderData.subtotalPriceSet || {});
      order.shippingPriceSet = JSON.stringify(orderData.shipping_price_set || orderData.shippingPriceSet || {});
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

      const savedOrder = await this.orderRepository.save(order);
      this.logger.log(`Order ${orderId} saved for shop ${shop}`);
      return savedOrder;
    } catch (error: any) {
      this.logger.error(`Failed to save order: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 根据 ID 获取订单
   */
  async getOrderById(shop: string, orderId: string): Promise<ShopOrderEntity | null> {
    return this.orderRepository.findOne({
      where: { id: orderId, shop },
    });
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
    await this.orderRepository.delete({ id: orderId, shop });
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
}