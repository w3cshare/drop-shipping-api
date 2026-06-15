import { Injectable, Logger } from '@nestjs/common';
import { ShopifyModule } from '../shopify.module';
import { ShopifySessionService } from '../session/shopify-session.service';

/**
 * Shopify GraphQL 客户端服务。
 *
 * 使用官方 @shopify/shopify-api 提供的 GraphQL 客户端，
 * 通过离线 token 发送请求。
 */
@Injectable()
export class ShopifyGraphqlService {
  private readonly logger = new Logger(ShopifyGraphqlService.name);

  constructor(private readonly sessionService: ShopifySessionService) {}

  /**
   * 执行 GraphQL 查询或变更。
   *
   * @param shop 店铺域名（xxx.myshopify.com）
   * @param query GraphQL 查询字符串
   * @param variables 查询变量
   */
  async query<T = any>(
    shop: string,
    query: string,
    variables: Record<string, any> = {},
  ): Promise<T> {
    try {
      const accessToken = await this.sessionService.getOfflineToken(shop);
      if (!accessToken) {
        throw new Error(`No access token found for shop: ${shop}`);
      }

      const shopify = ShopifyModule.shopify;
      // shopify-api v11 使用 session 对象构建客户端
      const session: any = {
        shop,
        accessToken,
        isOnline: false,
        state: 'state',
      };
      const client = new shopify.clients.Graphql({ session });

      const result = await client.request(query, { variables });

      return result as T;
    } catch (error: any) {
      this.logger.error(`GraphQL query failed for shop ${shop}: ${error.message}`, error.stack);
      throw error;
    }
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
