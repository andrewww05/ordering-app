import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateOrderDto,
  FindOrdersQueryDto,
  ORDER_PATTERNS,
  OrderHealthAck,
  OrderIdPayload,
  OrderRemovedAck,
  OrderResponse,
  PaginatedOrdersResponse,
  UpdateOrderPayload,
} from '@ordering-app/contracts';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern(ORDER_PATTERNS.create)
  create(@Payload() dto: CreateOrderDto): Promise<OrderResponse> {
    return this.ordersService.create(dto);
  }

  @MessagePattern(ORDER_PATTERNS.findAll)
  findAll(@Payload() query: FindOrdersQueryDto): Promise<PaginatedOrdersResponse> {
    return this.ordersService.findAll(query);
  }

  @MessagePattern(ORDER_PATTERNS.findOne)
  findOne(@Payload() payload: OrderIdPayload): Promise<OrderResponse> {
    return this.ordersService.findOne(payload.id);
  }

  @MessagePattern(ORDER_PATTERNS.update)
  update(@Payload() payload: UpdateOrderPayload): Promise<OrderResponse> {
    return this.ordersService.update(payload.id, payload.dto);
  }

  @MessagePattern(ORDER_PATTERNS.remove)
  remove(@Payload() payload: OrderIdPayload): Promise<OrderRemovedAck> {
    return this.ordersService.remove(payload.id);
  }

  @MessagePattern(ORDER_PATTERNS.health)
  health(): OrderHealthAck {
    return { status: 'ok' };
  }
}
