export const ORDER_PATTERNS = {
  create: 'orders.create',
  findAll: 'orders.findAll',
  findOne: 'orders.findOne',
  update: 'orders.update',
  remove: 'orders.remove',
  health: 'orders.health',
} as const;

export const ORDER_EVENTS = {
  orderCreated: 'order.created',
} as const;

export type OrderPattern = (typeof ORDER_PATTERNS)[keyof typeof ORDER_PATTERNS];
export type OrderEvent = (typeof ORDER_EVENTS)[keyof typeof ORDER_EVENTS];
