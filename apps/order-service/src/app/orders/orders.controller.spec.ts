import { Test } from '@nestjs/testing';
import { OrderStatus } from '@ordering-app/contracts';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

describe('OrdersController', () => {
  let controller: OrdersController;
  let orders: Record<string, jest.Mock>;

  beforeEach(async () => {
    orders = {
      create: jest.fn().mockResolvedValue({ id: ORDER_ID }),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
      findOne: jest.fn().mockResolvedValue({ id: ORDER_ID }),
      update: jest.fn().mockResolvedValue({ id: ORDER_ID }),
      remove: jest.fn().mockResolvedValue({ id: ORDER_ID }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: orders }],
    }).compile();

    controller = moduleRef.get(OrdersController);
  });

  it('unwraps the id payload for findOne', async () => {
    await controller.findOne({ id: ORDER_ID });

    expect(orders.findOne).toHaveBeenCalledWith(ORDER_ID);
  });

  it('splits the update payload into id and dto', async () => {
    await controller.update({ id: ORDER_ID, dto: { status: OrderStatus.CONFIRMED } });

    expect(orders.update).toHaveBeenCalledWith(ORDER_ID, { status: OrderStatus.CONFIRMED });
  });

  it('unwraps the id payload for remove', async () => {
    await controller.remove({ id: ORDER_ID });

    expect(orders.remove).toHaveBeenCalledWith(ORDER_ID);
  });

  it('forwards the create dto unchanged', async () => {
    const dto = { customerId: 'cust-1', items: [{ sku: 'A', quantity: 1, unitCents: 100 }] };

    await controller.create(dto);

    expect(orders.create).toHaveBeenCalledWith(dto);
  });

  it('answers the health pattern without touching the service', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('returns a non-undefined value from remove so the rpc reply is not empty', async () => {
    await expect(controller.remove({ id: ORDER_ID })).resolves.toBeDefined();
  });
});
