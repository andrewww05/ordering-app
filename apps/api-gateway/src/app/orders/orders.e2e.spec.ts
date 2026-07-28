import { INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { ORDER_PATTERNS, OrderStatus } from '@ordering-app/contracts';
import { NEVER, of, throwError } from 'rxjs';
import request from 'supertest';
import { ORDER_SERVICE_RABBITMQ } from '../../constants';
import { configureApp } from '../app.setup';
import { HealthModule } from '../health/health.module';
import { OrdersModule } from '../orders/orders.module';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

const ORDER = {
  id: ORDER_ID,
  customerId: 'cust-1',
  status: OrderStatus.PENDING,
  totalCents: 1250,
  items: [{ id: 'item-1', sku: 'SKU-A', quantity: 2, unitCents: 500 }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let send: jest.Mock;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    send = jest.fn();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
              ORDER_QUEUE: 'order_queue',
              API_GATEWAY_PORT: 3000,
              RPC_TIMEOUT_MS: 300,
            }),
          ],
        }),
        OrdersModule,
        HealthModule,
      ],
    })
      .overrideProvider(ORDER_SERVICE_RABBITMQ)
      .useValue({ send } as unknown as ClientProxy)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    send.mockReset();
  });

  function respondWith(value: unknown): void {
    send.mockReturnValue(of(value));
  }

  function failWith(error: unknown): void {
    send.mockReturnValue(throwError(() => error));
  }

  function neverRespond(): void {
    send.mockReturnValue(NEVER);
  }

  describe('POST /api/v1/orders', () => {
    it('creates an order and returns 201', async () => {
      respondWith(ORDER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .send({ customerId: 'cust-1', items: [{ sku: 'SKU-A', quantity: 2, unitCents: 500 }] })
        .expect(201);

      expect(response.body).toEqual(ORDER);
      expect(send).toHaveBeenCalledWith(ORDER_PATTERNS.create, {
        customerId: 'cust-1',
        items: [{ sku: 'SKU-A', quantity: 2, unitCents: 500 }],
      });
    });

    it('rejects a blank customerId with 400 before dispatching', async () => {
      respondWith(ORDER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .send({ customerId: '', items: [{ sku: 'SKU-A', quantity: 2, unitCents: 500 }] })
        .expect(400);

      expect(response.body.message).toContain('customerId should not be empty');
      expect(send).not.toHaveBeenCalled();
    });

    it('rejects an unknown property with 400', async () => {
      respondWith(ORDER);

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .send({
          customerId: 'cust-1',
          items: [{ sku: 'SKU-A', quantity: 2, unitCents: 500 }],
          totalCents: 999999,
        })
        .expect(400);

      expect(response.body.message).toContain('property totalCents should not exist');
      expect(send).not.toHaveBeenCalled();
    });

    it('rejects an empty items array with 400', async () => {
      respondWith(ORDER);

      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .send({ customerId: 'cust-1', items: [] })
        .expect(400);

      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/orders', () => {
    it('returns a paginated envelope', async () => {
      respondWith({ data: [ORDER], total: 1, page: 1, limit: 20 });

      const response = await request(app.getHttpServer()).get('/api/v1/orders').expect(200);

      expect(response.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    });

    it('coerces page and limit to numbers', async () => {
      respondWith({ data: [], total: 0, page: 2, limit: 5 });

      await request(app.getHttpServer()).get('/api/v1/orders?page=2&limit=5').expect(200);

      expect(send).toHaveBeenCalledWith(
        ORDER_PATTERNS.findAll,
        expect.objectContaining({ page: 2, limit: 5 }),
      );
    });

    it('rejects a limit above the cap with 400', async () => {
      respondWith({ data: [], total: 0, page: 1, limit: 20 });

      await request(app.getHttpServer()).get('/api/v1/orders?limit=1000').expect(400);

      expect(send).not.toHaveBeenCalled();
    });

    it('rejects an unknown status with 400', async () => {
      respondWith({ data: [], total: 0, page: 1, limit: 20 });

      await request(app.getHttpServer()).get('/api/v1/orders?status=NOPE').expect(400);
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('returns the order', async () => {
      respondWith(ORDER);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${ORDER_ID}`)
        .expect(200);

      expect(response.body.id).toBe(ORDER_ID);
      expect(send).toHaveBeenCalledWith(ORDER_PATTERNS.findOne, { id: ORDER_ID });
    });

    it('rejects a malformed uuid with 400 before dispatching', async () => {
      respondWith(ORDER);

      await request(app.getHttpServer()).get('/api/v1/orders/not-a-uuid').expect(400);

      expect(send).not.toHaveBeenCalled();
    });

    it('maps a 404 rpc error to a 404 response', async () => {
      failWith({ statusCode: 404, message: `Order ${ORDER_ID} not found`, error: 'NOT_FOUND' });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${ORDER_ID}`)
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        message: `Order ${ORDER_ID} not found`,
      });
    });

    it('maps an unrecognised rpc failure to 500 without leaking it', async () => {
      failWith(new Error('postgres://user:secret@db'));

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${ORDER_ID}`)
        .expect(500);

      expect(response.body.message).toBe('Internal server error');
      expect(JSON.stringify(response.body)).not.toContain('secret');
    });
  });

  describe('PATCH /api/v1/orders/:id', () => {
    it('forwards the id and the dto separately', async () => {
      respondWith({ ...ORDER, status: OrderStatus.CONFIRMED });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${ORDER_ID}`)
        .send({ status: OrderStatus.CONFIRMED })
        .expect(200);

      expect(response.body.status).toBe(OrderStatus.CONFIRMED);
      expect(send).toHaveBeenCalledWith(ORDER_PATTERNS.update, {
        id: ORDER_ID,
        dto: { status: OrderStatus.CONFIRMED },
      });
    });

    it('rejects an invalid status with 400', async () => {
      respondWith(ORDER);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${ORDER_ID}`)
        .send({ status: 'TELEPORTED' })
        .expect(400);

      expect(send).not.toHaveBeenCalled();
    });

    it('maps a 409 rpc error to a 409 response', async () => {
      failWith({ statusCode: 409, message: 'Order is SHIPPED', error: 'CONFLICT' });

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${ORDER_ID}`)
        .send({ status: OrderStatus.CANCELLED })
        .expect(409);
    });
  });

  describe('DELETE /api/v1/orders/:id', () => {
    it('returns 204 with an empty body', async () => {
      respondWith({ id: ORDER_ID });

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/orders/${ORDER_ID}`)
        .expect(204);

      expect(response.body).toEqual({});
      expect(send).toHaveBeenCalledWith(ORDER_PATTERNS.remove, { id: ORDER_ID });
    });

    it('maps a 409 rpc error to a 409 response', async () => {
      failWith({ statusCode: 409, message: 'Only PENDING orders can be deleted', error: 'CONFLICT' });

      await request(app.getHttpServer()).delete(`/api/v1/orders/${ORDER_ID}`).expect(409);
    });
  });

  describe('versioning', () => {
    it('does not expose an unversioned orders route', async () => {
      respondWith(ORDER);

      await request(app.getHttpServer()).get('/api/orders').expect(404);
    });
  });

  describe('when order-service never answers', () => {
    it('gives up with 504 instead of hanging', async () => {
      neverRespond();

      const response = await request(app.getHttpServer()).get('/api/v1/orders').expect(504);

      expect(response.body).toMatchObject({
        statusCode: 504,
        message: 'Order service is unavailable',
      });
    });
  });
});
