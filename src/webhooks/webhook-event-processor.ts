import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { WebhookQueueService } from './webhook-queue.service';
import { OrderService } from '../orders/order.service';

/**
 * Webhook 事件处理器。
 *
 * 负责从队列中取出事件并处理。
 * 支持订单创建、更新、取消、发货等事件。
 */
@Injectable()
export class WebhookEventProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookEventProcessor.name);

  // 处理间隔（毫秒）
  private readonly PROCESS_INTERVAL_MS = 5000;

  // 每批处理数量
  private readonly BATCH_SIZE = 20;

  // 是否正在运行
  private isRunning = false;

  // 定时器引用
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly webhookQueueService: WebhookQueueService,
    private readonly orderService: OrderService,
  ) {}

  onModuleInit() {
    this.startProcessing();
  }

  onModuleDestroy() {
    this.stopProcessing();
  }

  /**
   * 启动事件处理循环。
   */
  startProcessing(): void {
    if (this.isRunning) {
      this.logger.warn('Event processor already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('Webhook event processor started');

    this.processLoop();
  }

  /**
   * 停止事件处理循环。
   */
  stopProcessing(): void {
    this.isRunning = false;
    if (this.intervalHandle) {
      clearTimeout(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.logger.log('Webhook event processor stopped');
  }

  /**
   * 处理循环。
   */
  private async processLoop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.processBatch();
    } catch (error: any) {
      this.logger.error(`Error in process loop: ${error.message}`, error.stack);
    }

    // 继续调度下一次
    if (this.isRunning) {
      this.intervalHandle = setTimeout(() => this.processLoop(), this.PROCESS_INTERVAL_MS);
    }
  }

  /**
   * 处理一批事件。
   */
  private async processBatch(): Promise<void> {
    const events = await this.webhookQueueService.pollPendingEvents(this.BATCH_SIZE);

    if (events.length === 0) return;

    this.logger.log(`Processing batch of ${events.length} events`);

    for (const event of events) {
      try {
        await this.processEvent(event);
        await this.webhookQueueService.markCompleted(event.id);
      } catch (error: any) {
        this.logger.error(`Failed to process event ${event.id}: ${error.message}`);
        await this.webhookQueueService.markFailed(event.id, error.message);
      }
    }
  }

  /**
   * 处理单个事件。
   */
  private async processEvent(event: any): Promise<void> {
    const { eventType, shop, payload } = event;
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;

    this.logger.debug(`Processing ${eventType} event for ${shop}`);

    switch (eventType) {
      case 'orders/create':
        await this.handleOrderCreate(shop, data);
        break;

      case 'orders/updated':
        await this.handleOrderUpdate(shop, data);
        break;

      case 'orders/cancelled':
        await this.handleOrderCancel(shop, data);
        break;

      case 'orders/fulfilled':
        await this.handleOrderFulfill(shop, data);
        break;

      case 'orders/partially_fulfilled':
        await this.handleOrderPartiallyFulfill(shop, data);
        break;

      case 'orders/paid':
        await this.handleOrderPaid(shop, data);
        break;

      case 'orders/refunded':
        await this.handleOrderRefunded(shop, data);
        break;

      default:
        this.logger.debug(`Unhandled event type: ${eventType}`);
    }
  }

  // ========== 事件处理方法 ==========

  private async handleOrderCreate(shop: string, data: any): Promise<void> {
    await this.orderService.saveOrder(shop, data);
    this.logger.log(`Order ${data.id} (${data.name}) saved via queue`);
  }

  private async handleOrderUpdate(shop: string, data: any): Promise<void> {
    await this.orderService.saveOrder(shop, data);
    this.logger.log(`Order ${data.id} updated via queue`);
  }

  private async handleOrderCancel(shop: string, data: any): Promise<void> {
    await this.orderService.saveOrder(shop, data);
    this.logger.log(`Order ${data.id} cancellation recorded via queue`);
  }

  private async handleOrderFulfill(shop: string, data: any): Promise<void> {
    await this.orderService.saveOrder(shop, data);
    this.logger.log(`Order ${data.id} fulfillment recorded via queue`);
  }

  private async handleOrderPartiallyFulfill(shop: string, data: any): Promise<void> {
    await this.orderService.saveOrder(shop, data);
    this.logger.log(`Order ${data.id} partial fulfillment recorded via queue`);
  }

  private async handleOrderPaid(shop: string, data: any): Promise<void> {
    await this.orderService.saveOrder(shop, data);
    this.logger.log(`Order ${data.id} payment recorded via queue`);
  }

  private async handleOrderRefunded(shop: string, data: any): Promise<void> {
    await this.orderService.saveOrder(shop, data);
    this.logger.log(`Order ${data.id} refund recorded via queue`);
  }
}
