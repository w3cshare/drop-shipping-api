import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { WebhookQueueService } from './webhook-queue.service';
import { OrderService } from '../orders/order.service';
import { ProductService } from '../products/product.service';
import { PendingEventEntity } from '../database/entities/pending-event.entity';

@Injectable()
export class WebhookProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookProcessorService.name);

  private readonly PROCESS_INTERVAL_MS = 5000;
  private readonly BATCH_SIZE = 50;

  private isRunning = false;
  private processTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly queueService: WebhookQueueService,
    private readonly orderService: OrderService,
    private readonly productService: ProductService,
  ) {}

  onModuleInit() {
    this.start();
  }

  onModuleDestroy() {
    this.stop();
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.log('Webhook processor started');

    this.processPendingEvents();

    this.processTimer = setInterval(
      () => this.processPendingEvents(),
      this.PROCESS_INTERVAL_MS,
    );
  }

  stop(): void {
    this.isRunning = false;

    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }

    this.logger.log('Webhook processor stopped');
  }

  private async processPendingEvents(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const events = await this.queueService.pollPendingEvents(this.BATCH_SIZE);

      if (events.length === 0) {
        return;
      }

      this.logger.log(`[Processor] Processing ${events.length} pending events`);

      for (const event of events) {
        await this.processEvent(event);
      }
    } catch (error: any) {
      this.logger.error(`[Processor] Failed to process events: ${error.message}`, error.stack);
    }
  }

  private async processEvent(event: PendingEventEntity): Promise<void> {
    try {
      const payload = JSON.parse(event.payload);

      switch (event.eventType) {
        case 'orders/create':
        case 'orders/updated':
          await this.handleOrderEvent(event.shop, payload);
          break;

        case 'orders/cancelled':
          await this.handleOrderCancelled(event.shop, payload);
          break;

        case 'orders/fulfilled':
          await this.handleOrderFulfilled(event.shop, payload);
          break;

        case 'products/create':
        case 'products/update':
          await this.handleProductEvent(event.shop, payload);
          break;

        case 'products/delete':
          await this.handleProductDeleted(event.shop, payload);
          break;

        default:
          this.logger.warn(`[Processor] Unknown event type: ${event.eventType}`);
      }

      await this.queueService.markCompleted(event.id);
      this.logger.debug(`[Processor] Event ${event.id} (${event.eventType}) completed`);
    } catch (error: any) {
      this.logger.error(
        `[Processor] Failed to process event ${event.id} (${event.eventType}): ${error.message}`,
        error.stack,
      );

      await this.queueService.markFailed(event.id, error.message);
    }
  }

  private async handleOrderEvent(shop: string, payload: any): Promise<void> {
    await this.orderService.saveOrder(shop, payload);
  }

  private async handleOrderCancelled(shop: string, payload: any): Promise<void> {
    await this.orderService.saveOrder(shop, payload);
  }

  private async handleOrderFulfilled(shop: string, payload: any): Promise<void> {
    await this.orderService.saveOrder(shop, payload);
  }

  private async handleProductEvent(shop: string, payload: any): Promise<void> {
    await this.productService.saveProduct(shop, payload);
  }

  private async handleProductDeleted(shop: string, payload: any): Promise<void> {
    await this.productService.deleteProduct(shop, String(payload.id));
  }

  async processAllPending(): Promise<number> {
    let processedCount = 0;

    while (true) {
      const events = await this.queueService.pollPendingEvents(this.BATCH_SIZE);
      if (events.length === 0) break;

      for (const event of events) {
        await this.processEvent(event);
        processedCount++;
      }
    }

    this.logger.log(`[Processor] Processed ${processedCount} events in batch mode`);
    return processedCount;
  }
}