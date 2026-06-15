import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ShopifyAuthGuard } from '../shopify/auth/auth.guard';
import { ShopifyGraphqlService } from '../shopify/graphql/graphql.service';
import { BillingService } from '../billing/billing.service';
import { OrderStatusService } from '../shopify/config/order-status.service';

/**
 * 产品业务控制器
 * 
 * 示例业务控制器，展示如何使用 Shopify 服务
 * 使用 ShopifyAuthGuard 保护路由
 * 注入 ShopifyGraphqlService 和 BillingService
 */
@Controller('api')
@UseGuards(ShopifyAuthGuard)
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

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
    @Query('status') status: string = '',
    @Query('financial_status') financialStatus: string = '',
  ) {
    try {
      const shopify = (req as any).shopify;
      const shop = shopify.shop;

      this.logger.log(`Fetching orders for shop: ${shop}, status=${status}, financialStatus=${financialStatus}`);

      const { shop: shopInfo, orders } = await this.graphqlService.getOrders(
        shop,
        parseInt(limit, 10),
        {
          status: status || undefined,
          financialStatus: financialStatus || undefined,
        },
      );

      const mappedOrders = (orders?.edges || []).map((edge: any) => {
        const node = edge?.node ?? {};
        const edges = node.lineItems?.edges || [];
        const fulfillmentEdges = node.fulfillments?.edges || [];
        const shippingEdges = node.shippingLines?.edges || [];

        // 商品名称摘要（前 3 个）
        const itemNames: string[] = edges
          .slice(0, 3)
          .map((e: any) => e?.node?.title)
          .filter(Boolean);
        if (edges.length > 3) {
          itemNames.push(`还有 ${edges.length - 3} 件商品`);
        }

        // 物流/履约信息
        const logistics = fulfillmentEdges.map((f: any) => {
          const fn = f?.node;
          const tracking = fn?.trackingInfo?.[0];
          return {
            status: fn?.status,
            service: fn?.service,
            trackingCompany: tracking?.company,
            trackingNumber: tracking?.number,
            trackingUrl: tracking?.url,
            warehouse: fn?.assignedLocation?.name,
            location: fn?.assignedLocation
              ? [fn.assignedLocation.address1, fn.assignedLocation.city, fn.assignedLocation.countryCode].filter(Boolean).join(', ')
              : '',
            createdAt: fn?.createdAt,
            amount: fn?.totalPriceSet?.shopMoney?.amount
              ? { amount: fn.totalPriceSet.shopMoney.amount, currency: fn.totalPriceSet.shopMoney.currencyCode }
              : null,
          };
        });

        // 运费汇总
        const shippingFees = shippingEdges.map((s: any) => ({
          title: s?.node?.title,
          carrier: s?.node?.carrier,
          code: s?.node?.code,
          amount: s?.node?.priceSet?.shopMoney?.amount,
          currency: s?.node?.priceSet?.shopMoney?.currencyCode,
        }));
        const shippingFeeTotal = shippingFees
          .reduce((sum: number, f: any) => sum + (parseFloat(f.amount) || 0), 0)
          .toString();

        // 客户名称
        const customerName =
          node.customer?.displayName ||
          [node.customer?.firstName, node.customer?.lastName].filter(Boolean).join(' ').trim() ||
          '';

        // 渠道来源
        const channelType = node.channelInformation?.channel?.type;
        const channelLabel = this.orderStatusService.getChannelLabel(channelType);

        // 状态中文标签
        const statusLabel = this.orderStatusService.getStatusLabel(node.status);
        const financialStatusLabel = this.orderStatusService.getFinancialStatusLabel(node.displayFinancialStatus);
        const fulfillmentStatusLabel = this.orderStatusService.getFulfillmentStatusLabel(node.displayFulfillmentStatus);

        // 商品列表
        const items = edges.map((e: any) => {
          const li = e?.node;
          return {
            id: li?.id,
            title: li?.title,
            sku: li?.sku,
            quantity: li?.quantity,
            unitPrice: {
              original: li?.originalUnitPriceSet?.shopMoney?.amount,
              discounted: li?.discountedUnitPriceSet?.shopMoney?.amount,
              currency: li?.originalUnitPriceSet?.shopMoney?.currencyCode,
            },
            variant: li?.variant
              ? { id: li.variant.id, title: li.variant.title, sku: li.variant.sku, image: li.variant.image?.url }
              : null,
          };
        });

        return {
          id: node.id,
          orderId: node.id,
          orderName: node.name,
          channel: {
            type: channelType,
            label: channelLabel.label,
            name: node.channelInformation?.channel?.name || '',
          },
          itemNames: itemNames.length > 0 ? itemNames.join('、') : '无商品信息',
          itemCount: items.length,
          items,
          shop: shopInfo || {},
          customer: {
            name: customerName,
            firstName: node.customer?.firstName,
            lastName: node.customer?.lastName,
            email: node.customer?.email,
          },
          logistics,
          logisticsSummary: logistics.length > 0
            ? logistics.map((l: any) => [l.trackingCompany, l.trackingNumber].filter(Boolean).join(' - ')).join('; ')
            : '暂无履约信息',
          warehouseSummary: logistics.length > 0
            ? Array.from(new Set(logistics.map((l: any) => l.warehouse).filter(Boolean))).join('、')
            : '未分配仓库',
          shippingAddress: node.shippingAddress
            ? {
              name: [node.shippingAddress.firstName, node.shippingAddress.lastName].filter(Boolean).join(' ').trim(),
              phone: node.shippingAddress.phone,
              address: [
                node.shippingAddress.address1,
                node.shippingAddress.address2,
                node.shippingAddress.city,
                node.shippingAddress.province,
                node.shippingAddress.country,
                node.shippingAddress.zip,
              ].filter(Boolean).join(' '),
              city: node.shippingAddress.city,
              province: node.shippingAddress.province,
              country: node.shippingAddress.country,
              countryCode: node.shippingAddress.countryCodeV2,
            }
            : null,
          billingAddress: node.billingAddress
            ? {
              city: node.billingAddress.city,
              province: node.billingAddress.province,
              country: node.billingAddress.country,
              countryCode: node.billingAddress.countryCodeV2,
            }
            : null,
          shippingFees,
          shippingFeeTotal,
          dutiesAmount: node.totalDutiesSet?.shopMoney?.amount,
          amounts: {
            subtotal: node.subtotalPriceSet?.shopMoney?.amount,
            tax: node.totalTaxSet?.shopMoney?.amount,
            discount: node.totalDiscountsSet?.shopMoney?.amount,
            shipping: node.totalShippingPriceSet?.shopMoney?.amount,
            duties: node.totalDutiesSet?.shopMoney?.amount,
            refunded: node.totalRefundedSet?.shopMoney?.amount,
            total: node.totalPriceSet?.shopMoney?.amount,
            currentTotal: node.currentTotalPriceSet?.shopMoney?.amount,
            currency: node.currencyCode || node.totalPriceSet?.shopMoney?.currencyCode,
          },
          totalCost: node.subtotalPriceSet?.shopMoney?.amount,
          quote: node.subtotalPriceSet?.shopMoney?.amount,
          status: statusLabel,
          financialStatus: financialStatusLabel,
          fulfillmentStatus: fulfillmentStatusLabel,
          country: node.shippingAddress?.country || node.billingAddress?.country || '',
          dates: {
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
            processedAt: node.processedAt || node.createdAt,
          },
        };
      });

      return {
        success: true,
        data: mappedOrders,
        shopInfo: shopInfo || {},
        filters: {
          status: status || null,
          financial_status: financialStatus || null,
        },
        pageInfo: orders?.pageInfo || { hasNextPage: false, hasPreviousPage: false },
        totalCount: mappedOrders.length,
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