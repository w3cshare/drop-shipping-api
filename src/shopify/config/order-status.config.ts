/**
 * Shopify 订单状态配置表。
 *
 * 所有状态值严格对应 Shopify GraphQL Admin API 实际返回的枚举值，
 * 可直接用于查询过滤（如 orders(query: "financial_status:paid")）
 * 或作为前端/报表展示时的统一中文标签。
 */

/**
 * 订单主状态（Order.status）
 * 参考: https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderStatus
 */
export interface OrderStatusItem {
  value: string;
  label: string;
  description: string;
  color?: string;
}

export const ORDER_STATUS_LIST: OrderStatusItem[] = [
  {
    value: 'OPEN',
    label: '进行中',
    description: '订单处于开放状态，尚未关闭或取消',
    color: '#1677ff',
  },
  {
    value: 'CLOSED',
    label: '已关闭',
    description: '订单已由商家或系统主动关闭（不代表取消）',
    color: '#8c8c8c',
  },
  {
    value: 'CANCELLED',
    label: '已取消',
    description: '订单已被取消（库存会退还）',
    color: '#ff4d4f',
  },
  {
    value: 'ARCHIVED',
    label: '已归档',
    description: '订单已归档，不再显示在订单列表中',
    color: '#d9d9d9',
  },
];

/**
 * 财务状态（Order.displayFinancialStatus）
 * 参考: https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderFinancialStatus
 */
export const ORDER_FINANCIAL_STATUS_LIST: OrderStatusItem[] = [
  {
    value: 'PENDING',
    label: '待支付',
    description: '买家尚未支付或支付仍在处理',
    color: '#faad14',
  },
  {
    value: 'AUTHORIZED',
    label: '已授权',
    description: '支付已授权但尚未完成捕获',
    color: '#1677ff',
  },
  {
    value: 'PAID',
    label: '已支付',
    description: '订单已全额收到付款',
    color: '#52c41a',
  },
  {
    value: 'PARTIALLY_PAID',
    label: '部分支付',
    description: '仅收到部分付款',
    color: '#faad14',
  },
  {
    value: 'REFUNDED',
    label: '已退款',
    description: '订单金额已全额退还给买家',
    color: '#ff4d4f',
  },
  {
    value: 'PARTIALLY_REFUNDED',
    label: '部分退款',
    description: '订单收到部分退款',
    color: '#ff7a45',
  },
  {
    value: 'VOIDED',
    label: '已作废',
    description: '支付已被取消（信用卡授权被 void）',
    color: '#8c8c8c',
  },
];

/**
 * 履约状态（Order.displayFulfillmentStatus）
 * 参考: https://shopify.dev/docs/api/admin-graphql/latest/enums/OrderFulfillmentStatus
 */
export const ORDER_FULFILLMENT_STATUS_LIST: OrderStatusItem[] = [
  {
    value: 'UNFULFILLED',
    label: '未发货',
    description: '订单中没有任何商品被发货',
    color: '#faad14',
  },
  {
    value: 'PARTIALLY_FULFILLED',
    label: '部分发货',
    description: '只有部分商品被发货',
    color: '#1677ff',
  },
  {
    value: 'FULFILLED',
    label: '已发货',
    description: '所有商品均已发货',
    color: '#52c41a',
  },
  {
    value: 'SCHEDULED',
    label: '待发货',
    description: '履约安排已排期但尚未发货',
    color: '#722ed1',
  },
  {
    value: 'RESTOCKED',
    label: '已退货',
    description: '商品已退回库存',
    color: '#ff4d4f',
  },
];

/**
 * 订单渠道（来源）
 */
export const ORDER_CHANNEL_LIST: OrderStatusItem[] = [
  { value: 'POS', label: '线下门店', description: '通过 Shopify POS 完成的线下订单', color: '#fa8c16' },
  { value: 'ONLINE_STORE', label: '在线商店', description: '通过 Shopify 在线商店下单', color: '#1677ff' },
  { value: 'RETAIL', label: '零售渠道', description: '零售渠道（Shopify Retail）', color: '#eb2f96' },
  { value: 'FACEBOOK', label: 'Facebook/Instagram', description: '通过社交渠道下单', color: '#13c2c2' },
  { value: 'MARKETPLACE', label: '市场平台', description: 'Amazon/eBay 等市场平台', color: '#52c41a' },
  { value: 'APP', label: '第三方 App', description: '通过第三方 App 产生', color: '#722ed1' },
  { value: 'MOBILE', label: '移动端', description: '移动端产生的订单', color: '#f5222d' },
  { value: 'BUY_BUTTON', label: 'Buy Button', description: '通过 Buy Button 产生', color: '#2f54eb' },
  { value: 'MANUAL', label: '手工创建', description: '后台手动创建的订单', color: '#8c8c8c' },
  { value: 'DRAFT', label: '草稿订单', description: '由草稿订单转化', color: '#d9d9d9' },
];

export interface OrderStatusConfig {
  statuses: OrderStatusItem[];
  financialStatuses: OrderStatusItem[];
  fulfillmentStatuses: OrderStatusItem[];
  channels: OrderStatusItem[];
}

export const ORDER_STATUS_CONFIG: OrderStatusConfig = {
  statuses: ORDER_STATUS_LIST,
  financialStatuses: ORDER_FINANCIAL_STATUS_LIST,
  fulfillmentStatuses: ORDER_FULFILLMENT_STATUS_LIST,
  channels: ORDER_CHANNEL_LIST,
};
