import { Injectable, Logger } from '@nestjs/common';
import { ShopifyModule } from '../shopify.module';
import { ShopifySessionService } from '../session/shopify-session.service';

/**
 * Shopify GraphQL 客户端服务。
 *
 * 使用官方 @shopify/shopify-api 提供的 GraphQL 客户端，
 * 通过离线 token 发送请求。
 *
 * Token 自动刷新机制：
 * - 请求失败 401/403 时，自动刷新 token 并重试一次
 */
@Injectable()
export class ShopifyGraphqlService {
  private readonly logger = new Logger(ShopifyGraphqlService.name);

  constructor(private readonly sessionService: ShopifySessionService) {}

  /**
   * 执行 GraphQL 查询或变更，支持 token 过期自动刷新重试。
   *
   * @param shop 店铺域名
   * @param query GraphQL 查询字符串
   * @param variables 查询变量
   * @param _retryAttempt 内部使用：当前重试次数（默认 0）
   */
  async query<T = any>(
    shop: string,
    query: string,
    variables: Record<string, any> = {},
    _retryAttempt: number = 0
  ): Promise<T> {
    try {
      const accessToken = await this.sessionService.getOfflineToken(shop);
      if (!accessToken) {
        throw new Error(`No access token found for shop: ${shop}`);
      }

      const shopify = ShopifyModule.shopify;
      const session: any = {
        shop,
        accessToken,
        isOnline: false,
        state: 'state',
      };
      const client = new shopify.clients.Graphql({ session });

      return (await client.request(query, { variables })) as T;
    } catch (error: any) {
      // 检测是否为 401/403 token 过期错误
      const isAuthError = this.isAuthError(error);

      if (isAuthError && _retryAttempt === 0) {
        this.logger.warn(
          `GraphQL request returned ${this.getErrorStatus(error)} for ${shop}, ` +
            `attempting token refresh and retry...`
        );

        // 强制刷新 token
        const newToken = await this.sessionService.refreshOfflineToken(shop);

        if (newToken) {
          this.logger.log(`Token refreshed for ${shop}, retrying request...`);
          // 用新 token 重试一次
          return this.query<T>(shop, query, variables, _retryAttempt + 1);
        }

        this.logger.error(`Token refresh failed for ${shop}, cannot retry`);
      }

      this.logger.error(
        `GraphQL query failed for shop ${shop}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 判断错误是否为认证失败（401/403）。
   */
  private isAuthError(error: any): boolean {
    const status = this.getErrorStatus(error);
    if (status === 401 || status === 403) return true;

    // 检查错误消息
    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('unauthorized') || msg.includes('forbidden') ||
        msg.includes('invalid access token') || msg.includes('token expired')) {
      return true;
    }

    // 检查 GraphQL errors 中的认证相关错误
    if (error?.errors && Array.isArray(error.errors)) {
      for (const gqlError of error.errors) {
        const gqlMsg = (gqlError?.message || '').toLowerCase();
        if (gqlMsg.includes('unauthorized') || gqlMsg.includes('forbidden') ||
            gqlMsg.includes('token')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 从错误对象中提取 HTTP 状态码。
   */
  private getErrorStatus(error: any): number | null {
    // shopify-api 错误通常包含 response 或 status
    if (error?.status) return error.status;
    if (error?.statusCode) return error.statusCode;
    if (error?.response?.status) return error.response.status;
    if (error?.code) {
      // 部分 axios/http 错误
      const code = String(error.code);
      const match = code.match(/(\d{3})/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  }

  /** 获取产品列表（示例封装） */
  async getProducts(shop: string, first: number = 10): Promise<any> {
    const query = `
      query GetProducts($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
              status
              vendor
              productType
              createdAt
              updatedAt
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    sku
                    inventoryQuantity
                  }
                }
              }
              images(first: 5) {
                edges {
                  node {
                    id
                    url
                    altText
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `;
    return this.query(shop, query, { first });
  }

  /** 创建产品（示例封装） */
  async createProduct(shop: string, title: string, price: string): Promise<any> {
    const query = `
      mutation CreateProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product { id title handle status }
          userErrors { field message }
        }
      }
    `;
    const input = {
      title,
      variants: [{ price, inventoryManagement: 'SHOPIFY' }],
    };
    return this.query(shop, query, { input });
  }

  /** 获取订单列表 */
  async getOrders(shop: string, first: number = 10): Promise<any> {
    const query = `
      query GetOrders($first: Int!) {
        orders(first: $first) {
          edges {
            node {
              id
              name
              createdAt
              totalPrice
              totalPriceSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
                shopMoney {
                  amount
                  currencyCode
                }
              }
              displayFinancialStatus
              displayFulfillmentStatus
              lineItems(first: 20) {
                edges {
                  node {
                    id
                    title
                    quantity
                    sku
                    variant {
                      id
                      title
                    }
                  }
                }
              }
            }
          }
          pageInfo { hasNextPage hasPreviousPage }
        }
      }
    `;
    return this.query(shop, query, { first });
  }

  /** 获取客户列表（含 PII 字段） */
  async getCustomers(shop: string, first: number = 10): Promise<any> {
    const query = `
      query GetCustomers($first: Int!) {
        customers(first: $first) {
          edges {
            node {
              id
              email
              firstName
              lastName
              phone
              createdAt
              state
              tags
              numberOfOrders
              updatedAt
              verifiedEmail
            }
          }
          pageInfo { hasNextPage hasPreviousPage }
        }
      }
    `;
    return this.query(shop, query, { first });
  }

  /** 获取店铺信息 */
  async getShopInfo(shop: string): Promise<any> {
    const query = `
      query GetShop {
        shop {
          id
          name
          email
          domain
          myshopifyDomain
          currencyCode
          primaryDomain { url host sslEnabled }
        }
      }
    `;
    return this.query(shop, query);
  }
}
