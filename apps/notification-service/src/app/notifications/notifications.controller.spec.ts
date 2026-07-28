import { Logger } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { OrderCreatedEvent } from '@ordering-app/contracts';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const EVENT: OrderCreatedEvent = {
  orderId: '11111111-1111-4111-8111-111111111111',
  customerId: 'cust-1',
  totalCents: 1250,
  itemCount: 2,
  occurredAt: '2026-01-01T00:00:00.000Z',
};

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notifications: { notifyOrderCreated: jest.Mock };
  let ack: jest.Mock;
  let nack: jest.Mock;
  let context: RmqContext;
  const message = { fields: { deliveryTag: 1 } };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    notifications = { notifyOrderCreated: jest.fn().mockResolvedValue(undefined) };
    ack = jest.fn();
    nack = jest.fn();

    context = {
      getChannelRef: () => ({ ack, nack }),
      getMessage: () => message,
    } as unknown as RmqContext;

    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: notifications }],
    }).compile();

    controller = moduleRef.get(NotificationsController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('acks the message once the notification succeeds', async () => {
    await controller.handleOrderCreated(EVENT, context);

    expect(notifications.notifyOrderCreated).toHaveBeenCalledWith(EVENT);
    expect(ack).toHaveBeenCalledWith(message);
    expect(nack).not.toHaveBeenCalled();
  });

  it('nacks without requeueing when the handler throws', async () => {
    notifications.notifyOrderCreated.mockRejectedValue(new Error('smtp down'));

    await controller.handleOrderCreated(EVENT, context);

    expect(nack).toHaveBeenCalledWith(message, false, false);
    expect(ack).not.toHaveBeenCalled();
  });

  it('does not requeue a poison message', async () => {
    notifications.notifyOrderCreated.mockRejectedValue(new Error('malformed'));

    await controller.handleOrderCreated(EVENT, context);

    const [, allUpTo, requeue] = nack.mock.calls[0];

    expect(allUpTo).toBe(false);
    expect(requeue).toBe(false);
  });
});
