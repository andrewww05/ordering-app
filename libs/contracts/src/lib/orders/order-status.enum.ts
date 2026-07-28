export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED',
}

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.SHIPPED,
  OrderStatus.CANCELLED,
];

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}
