import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import {
  CreateOrderDto,
  FindOrdersQueryDto,
  ORDER_PATTERNS,
  OrderRemovedAck,
  OrderResponse,
  PaginatedOrdersResponse,
  UpdateOrderDto,
} from '@ordering-app/contracts';
import { firstValueFrom, timeout } from 'rxjs';
import { ORDER_SERVICE_RABBITMQ } from '../../constants';
import { EnvironmentVariables } from '../config/env.validation';

@Injectable()
export class OrdersGatewayService {
  private readonly timeoutMs: number;

  constructor(
    @Inject(ORDER_SERVICE_RABBITMQ) private readonly client: ClientProxy,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.timeoutMs = config.getOrThrow('RPC_TIMEOUT_MS', { infer: true });
  }

  create(dto: CreateOrderDto): Promise<OrderResponse> {
    return this.request<OrderResponse, CreateOrderDto>(ORDER_PATTERNS.create, dto);
  }

  findAll(query: FindOrdersQueryDto): Promise<PaginatedOrdersResponse> {
    return this.request<PaginatedOrdersResponse, FindOrdersQueryDto>(
      ORDER_PATTERNS.findAll,
      query,
    );
  }

  findOne(id: string): Promise<OrderResponse> {
    return this.request<OrderResponse, { id: string }>(ORDER_PATTERNS.findOne, { id });
  }

  update(id: string, dto: UpdateOrderDto): Promise<OrderResponse> {
    return this.request<OrderResponse, { id: string; dto: UpdateOrderDto }>(
      ORDER_PATTERNS.update,
      { id, dto },
    );
  }

  remove(id: string): Promise<OrderRemovedAck> {
    return this.request<OrderRemovedAck, { id: string }>(ORDER_PATTERNS.remove, { id });
  }

  ping(): Promise<{ status: string }> {
    return this.request<{ status: string }, Record<string, never>>(ORDER_PATTERNS.health, {});
  }

  private request<TResult, TPayload>(pattern: string, payload: TPayload): Promise<TResult> {
    return firstValueFrom(
      this.client.send<TResult, TPayload>(pattern, payload).pipe(timeout(this.timeoutMs)),
    );
  }
}
