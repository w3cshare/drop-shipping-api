import { Injectable } from '@nestjs/common';
import {
  ORDER_STATUS_CONFIG,
  ORDER_STATUS_LIST,
  ORDER_FINANCIAL_STATUS_LIST,
  ORDER_FULFILLMENT_STATUS_LIST,
  ORDER_CHANNEL_LIST,
  type OrderStatusItem,
  type OrderStatusConfig,
} from './order-status.config';

/**
 * 订单状态服务。
 *
 * 职责：
 * 1) 统一读取 `order-status.config` 定义的状态/渠道列表；
 * 2) 提供 `getLabel*` 系列辅助方法，将 Shopify 返回的英文枚举值
 *    映射为中文标签，供 Controller / 前端展示。
 */
@Injectable()
export class OrderStatusService {
  /**
   * 获取完整配置（状态 + 财务 + 履约 + 渠道）。
   */
  getAll(): OrderStatusConfig {
    return { ...ORDER_STATUS_CONFIG };
  }

  /**
   * 根据原始 value 查找配置项（大小写不敏感，支持 undefined/null 入参）。
   */
  private find(list: OrderStatusItem[], raw?: string | null): OrderStatusItem | null {
    if (!raw) return null;
    const up = String(raw).toUpperCase();
    return list.find((it) => it.value.toUpperCase() === up) ?? null;
  }

  /** 订单主状态 → { value, label, color } */
  getStatusLabel(status?: string | null): { value: string; label: string; color?: string } {
    const raw = status || 'OPEN';
    const item = this.find(ORDER_STATUS_LIST, raw);
    return item ? { value: raw, label: item.label, color: item.color } : { value: raw, label: raw };
  }

  /** 财务状态 → { value, label, color } */
  getFinancialStatusLabel(status?: string | null): { value: string; label: string; color?: string } {
    const raw = status || 'PENDING';
    const item = this.find(ORDER_FINANCIAL_STATUS_LIST, raw);
    return item ? { value: raw, label: item.label, color: item.color } : { value: raw, label: raw };
  }

  /** 履约状态 → { value, label, color } */
  getFulfillmentStatusLabel(status?: string | null): { value: string; label: string; color?: string } {
    const raw = status || 'UNFULFILLED';
    const item = this.find(ORDER_FULFILLMENT_STATUS_LIST, raw);
    return item ? { value: raw, label: item.label, color: item.color } : { value: raw, label: raw };
  }

  /** 渠道 → { value, label, color } */
  getChannelLabel(channelType?: string | null): { value: string; label: string; color?: string } {
    const raw = channelType || '';
    if (!raw) return { value: '', label: '未知渠道' };
    const item = this.find(ORDER_CHANNEL_LIST, raw);
    return item ? { value: raw, label: item.label, color: item.color } : { value: raw, label: raw };
  }
}
