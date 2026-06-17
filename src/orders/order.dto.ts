/**
 * 订单相关 DTO 定义
 */

/**
 * 订单查询过滤条件
 */
export class OrderFiltersDto {
  status?: string;
  financialStatus?: string;
  fulfillmentStatus?: string;
  startDate?: Date;
  endDate?: Date;
  keyword?: string;
}

/**
 * 订单查询请求参数
 */
export class QueryOrderDto {
  page?: number = 1;
  pageSize?: number = 20;
  filters?: OrderFiltersDto;
}

/**
 * 分页订单列表响应
 */
export class PaginatedOrdersResponseDto {
  items: OrderResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 订单统计响应
 */
export class OrderStatsDto {
  totalCount: number;
  totalAmount: string;
  byStatus: Record<string, number>;
  byFinancialStatus: Record<string, number>;
}

/**
 * 订单详情响应 DTO
 *
 * 将数据库实体转换为对外响应格式
 * 主要工作：解析 text 字段中存储的 JSON
 */
export class OrderResponseDto {
  id: number;
  name: string;
  shop: string;
  status: string;
  order_id: string;
  order_status_url: string;
  source_name: string;
  customer: Record<string, any> | null;
  financial_status: string;
  fulfillment_status: string;
  total_price_set: Record<string, any> | null;
  subtotal_price_set: Record<string, any> | null;
  shipping_price_set: Record<string, any> | null;
  total_tax_set: Record<string, any> | null;
  total_refunded_set: Record<string, any> | null;
  refunded: boolean;
  payment_gateway_names: string[];
  line_items: Record<string, any>[] | null;
  shipping_address: Record<string, any> | null;
  billing_address: Record<string, any> | null;
  type: string;
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