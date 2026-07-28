import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import {
  CreateOrderDto,
  FindOrdersQueryDto,
  ORDER_EVENTS,
  OrderCreatedEvent,
  OrderResponse,
  OrderStatus,
  PaginatedOrdersResponse,
  UpdateOrderDto,
  isTerminalOrderStatus,
  rpcError,
} from '@ordering-app/contracts';
import { Prisma } from '../../generated/prisma/client';
import { NOTIFICATION_SERVICE_RABBITMQ } from '../../constants';
import { PrismaService } from '../prisma/prisma.service';
import { calculateTotalCents, toOrderResponse } from './orders.mapper';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_SERVICE_RABBITMQ) private readonly notifications: ClientProxy,
  ) {}

  async create(dto: CreateOrderDto): Promise<OrderResponse> {
    const order = await this.prisma.order.create({
      data: {
        customerId: dto.customerId,
        totalCents: calculateTotalCents(dto.items),
        items: {
          create: dto.items.map((item) => ({
            sku: item.sku,
            quantity: item.quantity,
            unitCents: item.unitCents,
          })),
        },
      },
      include: { items: true },
    });

    this.publishOrderCreated(order.id, order.customerId, order.totalCents, order.items.length);

    return toOrderResponse(order);
  }

  async findAll(query: FindOrdersQueryDto): Promise<PaginatedOrdersResponse> {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map(toOrderResponse),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: string): Promise<OrderResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      throw new RpcException(rpcError(HttpStatus.NOT_FOUND, `Order ${id} not found`));
    }

    return toOrderResponse(order);
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderResponse> {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new RpcException(rpcError(HttpStatus.NOT_FOUND, `Order ${id} not found`));
    }

    if (isTerminalOrderStatus(existing.status as OrderStatus)) {
      throw new RpcException(
        rpcError(
          HttpStatus.CONFLICT,
          `Order ${id} is ${existing.status} and can no longer be modified`,
        ),
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({
          data: dto.items.map((item) => ({
            orderId: id,
            sku: item.sku,
            quantity: item.quantity,
            unitCents: item.unitCents,
          })),
        });
      }

      return tx.order.update({
        where: { id },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.items ? { totalCents: calculateTotalCents(dto.items) } : {}),
        },
        include: { items: true },
      });
    });

    return toOrderResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new RpcException(rpcError(HttpStatus.NOT_FOUND, `Order ${id} not found`));
    }

    if (existing.status !== OrderStatus.PENDING) {
      throw new RpcException(
        rpcError(
          HttpStatus.CONFLICT,
          `Only ${OrderStatus.PENDING} orders can be deleted, order ${id} is ${existing.status}`,
        ),
      );
    }

    await this.prisma.order.delete({ where: { id } });
  }

  private publishOrderCreated(
    orderId: string,
    customerId: string,
    totalCents: number,
    itemCount: number,
  ): void {
    const event: OrderCreatedEvent = {
      orderId,
      customerId,
      totalCents,
      itemCount,
      occurredAt: new Date().toISOString(),
    };

    this.notifications.emit(ORDER_EVENTS.orderCreated, event).subscribe({
      error: (error: unknown) =>
        this.logger.error(`Failed to publish ${ORDER_EVENTS.orderCreated} for ${orderId}`, error),
    });
  }
}
