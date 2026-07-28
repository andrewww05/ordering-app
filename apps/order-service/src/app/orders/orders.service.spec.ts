import { HttpStatus } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { ORDER_EVENTS, OrderStatus, RpcErrorPayload } from '@ordering-app/contracts';
import { of } from 'rxjs';
import { NOTIFICATION_SERVICE_RABBITMQ } from '../../constants';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function buildOrderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ORDER_ID,
    customerId: 'cust-1',
    status: OrderStatus.PENDING,
    totalCents: 1250,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [
      { id: 'item-1', orderId: ORDER_ID, sku: 'SKU-A', quantity: 2, unitCents: 500 },
      { id: 'item-2', orderId: ORDER_ID, sku: 'SKU-B', quantity: 1, unitCents: 250 },
    ],
    ...overrides,
  };
}

function rpcPayload(error: unknown): RpcErrorPayload {
  return (error as RpcException).getError() as RpcErrorPayload;
}

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    orderItem: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let notifications: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      order: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      orderItem: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(),
    };

    notifications = { emit: jest.fn().mockReturnValue(of(undefined)) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_SERVICE_RABBITMQ, useValue: notifications as unknown as ClientProxy },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  describe('create', () => {
    it('derives totalCents from the items instead of trusting the caller', async () => {
      prisma.order.create.mockResolvedValue(buildOrderRow());

      await service.create({
        customerId: 'cust-1',
        items: [
          { sku: 'SKU-A', quantity: 2, unitCents: 500 },
          { sku: 'SKU-B', quantity: 1, unitCents: 250 },
        ],
      });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalCents: 1250 }),
        }),
      );
    });

    it('returns a serialised order with ISO timestamps', async () => {
      prisma.order.create.mockResolvedValue(buildOrderRow());

      const result = await service.create({
        customerId: 'cust-1',
        items: [{ sku: 'SKU-A', quantity: 2, unitCents: 500 }],
      });

      expect(result).toMatchObject({
        id: ORDER_ID,
        status: OrderStatus.PENDING,
        totalCents: 1250,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      expect(result.items).toHaveLength(2);
    });

    it('publishes exactly one order.created event', async () => {
      prisma.order.create.mockResolvedValue(buildOrderRow());

      await service.create({
        customerId: 'cust-1',
        items: [{ sku: 'SKU-A', quantity: 2, unitCents: 500 }],
      });

      expect(notifications.emit).toHaveBeenCalledTimes(1);
      expect(notifications.emit).toHaveBeenCalledWith(
        ORDER_EVENTS.orderCreated,
        expect.objectContaining({ orderId: ORDER_ID, customerId: 'cust-1', totalCents: 1250 }),
      );
    });
  });

  describe('findAll', () => {
    it('paginates with skip and take derived from the query', async () => {
      prisma.$transaction.mockResolvedValue([[buildOrderRow()], 41]);

      const result = await service.findAll({ page: 3, limit: 10 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result).toMatchObject({ total: 41, page: 3, limit: 10 });
    });

    it('filters by status and customerId when provided', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.findAll({
        page: 1,
        limit: 20,
        status: OrderStatus.SHIPPED,
        customerId: 'cust-9',
      });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: OrderStatus.SHIPPED, customerId: 'cust-9' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws a 404 rpc error when the order is missing', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      const error = await service.findOne(ORDER_ID).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(RpcException);
      expect(rpcPayload(error).statusCode).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('update', () => {
    it('rejects modifying a shipped order with 409', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: ORDER_ID, status: OrderStatus.SHIPPED });

      const error = await service
        .update(ORDER_ID, { status: OrderStatus.CANCELLED })
        .catch((caught: unknown) => caught);

      expect(rpcPayload(error).statusCode).toBe(HttpStatus.CONFLICT);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects modifying a cancelled order with 409', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: ORDER_ID, status: OrderStatus.CANCELLED });

      const error = await service
        .update(ORDER_ID, { status: OrderStatus.CONFIRMED })
        .catch((caught: unknown) => caught);

      expect(rpcPayload(error).statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('recomputes totalCents when items are replaced', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: ORDER_ID, status: OrderStatus.PENDING });
      prisma.order.update.mockResolvedValue(buildOrderRow({ totalCents: 2100 }));
      prisma.$transaction.mockImplementation((handler: (tx: unknown) => unknown) =>
        handler(prisma),
      );

      await service.update(ORDER_ID, { items: [{ sku: 'X', quantity: 3, unitCents: 700 }] });

      expect(prisma.orderItem.deleteMany).toHaveBeenCalledWith({ where: { orderId: ORDER_ID } });
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totalCents: 2100 }) }),
      );
    });

    it('leaves items untouched when only the status changes', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: ORDER_ID, status: OrderStatus.PENDING });
      prisma.order.update.mockResolvedValue(buildOrderRow({ status: OrderStatus.CONFIRMED }));
      prisma.$transaction.mockImplementation((handler: (tx: unknown) => unknown) =>
        handler(prisma),
      );

      await service.update(ORDER_ID, { status: OrderStatus.CONFIRMED });

      expect(prisma.orderItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: OrderStatus.CONFIRMED } }),
      );
    });
  });

  describe('remove', () => {
    it('deletes a pending order and acknowledges with its id', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: ORDER_ID, status: OrderStatus.PENDING });
      prisma.order.delete.mockResolvedValue(buildOrderRow());

      await expect(service.remove(ORDER_ID)).resolves.toEqual({ id: ORDER_ID });
      expect(prisma.order.delete).toHaveBeenCalledWith({ where: { id: ORDER_ID } });
    });

    it('refuses to delete a shipped order with 409', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: ORDER_ID, status: OrderStatus.SHIPPED });

      const error = await service.remove(ORDER_ID).catch((caught: unknown) => caught);

      expect(rpcPayload(error).statusCode).toBe(HttpStatus.CONFLICT);
      expect(prisma.order.delete).not.toHaveBeenCalled();
    });

    it('throws 404 when the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      const error = await service.remove(ORDER_ID).catch((caught: unknown) => caught);

      expect(rpcPayload(error).statusCode).toBe(HttpStatus.NOT_FOUND);
    });
  });
});
