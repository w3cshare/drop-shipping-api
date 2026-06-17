/**
 * 共用基础 DTO
 */

/**
 * 基础过滤条件（订单/商品共用）
 */
export class BaseShopFilters {
  status?: string;
  startDate?: Date;
  endDate?: Date;
  keyword?: string;
}

/**
 * 分页响应基础结构
 */
export interface PaginatedResponse<ItemDto> {
  items: ItemDto[];
  total: number;
  page: number;
  pageSize: number;
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