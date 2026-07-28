import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { ORDER_EVENTS, OrderCreatedEvent } from '@ordering-app/contracts';
import type { Channel, ConsumeMessage } from 'amqplib';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notifications: NotificationsService) {}

  @EventPattern(ORDER_EVENTS.orderCreated)
  async handleOrderCreated(
    @Payload() event: OrderCreatedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as ConsumeMessage;

    try {
      await this.notifications.notifyOrderCreated(event);
      channel.ack(message);
    } catch (error) {
      this.logger.error(`Dropping unprocessable ${ORDER_EVENTS.orderCreated} message`, error);
      channel.nack(message, false, false);
    }
  }
}
