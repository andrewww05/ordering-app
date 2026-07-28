import { OrderResponse, OrderStatus } from '@ordering-app/contracts';
import { Order, OrderItem } from '../../generated/prisma/client';

type OrderWithItems = Order & { items: OrderItem[] };

export function toOrderResponse(order: OrderWithItems): OrderResponse {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status as OrderStatus,
    totalCents: order.totalCents,
    items: order.items.map((item) => ({
      id: item.id,
      sku: item.sku,
      quantity: item.quantity,
      unitCents: item.unitCents,
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export function calculateTotalCents(
  items: readonly { quantity: number; unitCents: number }[],
): number {
  return items.reduce((total, item) => total + item.quantity * item.unitCents, 0);
}
