import { Injectable, Logger } from '@nestjs/common';
import { OrderCreatedEvent } from '@ordering-app/contracts';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async notifyOrderCreated(event: OrderCreatedEvent): Promise<void> {
    if (!event?.orderId) {
      throw new Error('Received order.created event without an orderId');
    }

    this.logger.log(
      `Notified ${event.customerId} about order ${event.orderId}: ` +
        `${event.itemCount} item(s), ${event.totalCents} cents, placed at ${event.occurredAt}`,
    );
  }
}
