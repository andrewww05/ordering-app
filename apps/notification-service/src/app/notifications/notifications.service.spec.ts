import { Logger } from '@nestjs/common';
import { OrderCreatedEvent } from '@ordering-app/contracts';
import { NotificationsService } from './notifications.service';

const EVENT: OrderCreatedEvent = {
  orderId: '11111111-1111-4111-8111-111111111111',
  customerId: 'cust-1',
  totalCents: 1250,
  itemCount: 2,
  occurredAt: '2026-01-01T00:00:00.000Z',
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    service = new NotificationsService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports the delivery including the order and customer', async () => {
    await service.notifyOrderCreated(EVENT);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain(EVENT.orderId);
    expect(log.mock.calls[0][0]).toContain(EVENT.customerId);
  });

  it('rejects an event without an orderId', async () => {
    await expect(
      service.notifyOrderCreated({ ...EVENT, orderId: '' }),
    ).rejects.toThrow('without an orderId');
  });
});
