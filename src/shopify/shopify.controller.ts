import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ShopifyAuthGuard } from './auth/auth.guard';
import { ShopifyGraphqlService } from './graphql/graphql.service';
import { BillingService } from '../billing/billing.service';
import { OrderStatusService } from './config/order-status.service';

/**
 * 产品业务控制器
 * 
 * 示例业务控制器，展示如何使用 Shopify 服务
 * 使用 ShopifyAuthGuard 保护路由
 * 注入 ShopifyGraphqlService 和 BillingService
 */
@Controller('shopify/api')
@UseGuards(ShopifyAuthGuard)
export class ShopifyController {
  private readonly logger = new Logger(ShopifyController.name);

  constructor(
    private readonly graphqlService: ShopifyGraphqlService,
    private readonly billingService: BillingService,
    private readonly orderStatusService: OrderStatusService,
  ) {}

  /**
   * 获取产品列表
   * 
   * 从请求中获取店铺信息（由 ShopifyAuthGuard 注入）
   * 使用 GraphQL 查询产品数据
   */
  @Get('products')
  async getProducts(
    @Req() req: Request,
    @Query('limit') limit: string = '10',
  ) {
    try {
      // 从请求中获取店铺信息
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      this.logger.log(`Fetching products for shop: ${shop}`);

      // 检查订阅状态（可选）
      const hasSubscription = await this.billingService.hasActiveSubscription(shop);
      
      if (!hasSubscription) {
        // 可以返回提示信息或限制功能
        this.logger.warn(`Shop ${shop} does not have active subscription`);
      }

      // 获取产品列表
      const products = await this.graphqlService.getProducts(shop, parseInt(limit, 10));

      return {
        success: true,
        data: products,
        shop,
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch products: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取单个产品详情
   */
  @Get('product')
  async getProduct(
    @Req() req: Request,
    @Query('id') productId: string,
  ) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      if (!productId) {
        return {
          success: false,
          error: 'Product ID is required',
        };
      }

      const query = `
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            title
            handle
            status
            vendor
            productType
            description
            createdAt
            updatedAt
            variants(first: 20) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                  inventoryQuantity
                  availableForSale
                }
              }
            }
            images(first: 10) {
              edges {
                node {
                  id
                  url
                  altText
                }
              }
            }
            options {
              id
              name
              values
            }
          }
        }
      `;

      const result = await this.graphqlService.query<{ product: any }>(
        shop,
        query,
        { id: productId },
      );

      return {
        success: true,
        data: result.product,
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch product: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 检测 Shopify PCD（Protected Customer Data）错误并返回友好提示
   */
  private isProtectedDataError(errorMessage: string): boolean {
    const keywords = [
      'not approved to access the Order',
      'not approved to access the Customer',
      'protected-customer-data',
      'protected customer data',
      'Protected customer data',
    ];
    return keywords.some((k) => errorMessage.includes(k));
  }

  private getProtectedDataHint(entity: string): string {
    return (
      `需要在 Shopify Partner 后台启用 ${entity} 数据访问权限：\n` +
      '1. 登录 https://partners.shopify.com/\n' +
      '2. 进入 Apps → 你的应用 → API access\n' +
      '3. 在 "Protected customer data" 部分勾选 Orders / Customers\n' +
      '4. 保存后，让商家在 Shopify 后台重新安装/授权此应用\n' +
      '参考文档：https://shopify.dev/docs/apps/launch/protected-customer-data'
    );
  }

  /**
   * 获取订单状态配置
   */
  @Get('orders/status')
  async getOrderStatusConfig() {
    return {
      success: true,
      data: this.orderStatusService.getAll(),
    };
  }

  /**
   * 获取订单列表（支持按状态过滤）
   *
   * @param limit 每次返回条数
   * @param status 按订单状态过滤：OPEN / CLOSED / CANCELLED / ARCHIVED
   * @param financial_status 按财务状态过滤：PENDING / AUTHORIZED / PAID / REFUNDED 等
   */
  @Get('orders')
  async getOrders(
    @Req() req: Request,
    @Query('limit') limit: string = '10',
  ) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      this.logger.log(`Fetching orders for shop: ${shop}`);

      const result = await this.graphqlService.getOrders(shop, parseInt(limit, 10));

      return {
        success: true,
        count: result.count,
        orders: result.orders,
        page_info: result.page_info,
        shop,
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch orders: ${error.message}`, error.stack);

      if (this.isProtectedDataError(error.message)) {
        return {
          success: false,
          error: 'PCD_NOT_APPROVED',
          message: '应用未被授权访问订单数据',
          hint: this.getProtectedDataHint('Orders'),
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取客户列表
   */
  @Get('customers')
  async getCustomers(
    @Req() req: Request,
    @Query('limit') limit: string = '10',
  ) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      this.logger.log(`Fetching customers for shop: ${shop}`);

      const customers = await this.graphqlService.getCustomers(shop, parseInt(limit, 10));

      return {
        success: true,
        data: customers,
        shop,
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch customers: ${error.message}`, error.stack);

      if (this.isProtectedDataError(error.message)) {
        return {
          success: false,
          error: 'PCD_NOT_APPROVED',
          message: '应用未被授权访问客户数据',
          hint: this.getProtectedDataHint('Customers'),
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取订阅状态
   */
  @Get('subscription')
  async getSubscription(@Req() req: Request) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      const subscription = await this.billingService.getActiveSubscription(shop);

      return {
        success: true,
        data: subscription,
        hasActiveSubscription: subscription && subscription.status === 'ACTIVE',
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch subscription: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取店铺信息
   */
  @Get('shop')
  async getShopInfo(@Req() req: Request) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      const query = `
        query GetShopInfo {
          shop {
            id
            name
            email
            myshopifyDomain
            primaryDomain {
              url
              host
            }
            currencyCode
            ianaTimezone
            billingAddress {
              city
              country
              countryCode
            }
            plan {
              displayName
            }
            createdAt
          }
        }
      `;

      const result = await this.graphqlService.query<{ shop: any }>(shop, query);

      return {
        success: true,
        data: result.shop,
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch shop info: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}