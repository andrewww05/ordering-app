import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from './order-status.enum';

export class OrderItemResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SKU-1001' })
  sku: string;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({ example: 500 })
  unitCents: number;
}

export class OrderResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'cust-1' })
  customerId: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ example: 1000, description: 'Order total in minor units, derived from items' })
  totalCents: number;

  @ApiProperty({ type: [OrderItemResponse] })
  items: OrderItemResponse[];

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class PaginatedOrdersResponse {
  @ApiProperty({ type: [OrderResponse] })
  data: OrderResponse[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}

export interface OrderCreatedEvent {
  orderId: string;
  customerId: string;
  totalCents: number;
  itemCount: number;
  occurredAt: string;
}
