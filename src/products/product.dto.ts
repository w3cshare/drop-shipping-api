/**
 * 商品相关 DTO 定义
 */

/**
 * 商品过滤条件
 */
export class ProductFiltersDto {
  status?: string;
  productType?: string;
  vendor?: string;
  keyword?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * 分页商品列表响应
 */
export class PaginatedProductsResponseDto {
  items: ProductResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 商品详情响应 DTO
 *
 * 将数据库实体转换为对外响应格式
 * 主要工作：解析 text 字段中存储的 JSON
 */
export class ProductResponseDto {
  id: number;
  product_id: string;
  name: string;
  shop: string;
  shop_name: string | null;
  shop_email: string | null;
  shop_domain: string | null;
  shop_currency: string | null;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  product_type: string;
  status: string;
  tags: string[];
  images: Record<string, any>[] | null;
  variants: Record<string, any>[] | null;
  options: Record<string, any>[] | null;
  created_at: string | null;
  updated_at: string | null;
  db_created_at: string | null;
  db_updated_at: string | null;
}

/**
 * JSON 安全解析辅助函数
 */
export function safeParseJson(raw?: string): Record<string, any> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
