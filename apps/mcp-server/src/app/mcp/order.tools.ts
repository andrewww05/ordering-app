import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  FindOrdersQueryDto,
  MAX_LIMIT,
  OrderStatus,
  UpdateOrderDto,
} from '@ordering-app/contracts';
import { z } from 'zod';
import { OrdersRpcService } from '../orders/orders.rpc-service';
import { toolError, toolFailure, toolJson } from './tool-result';

const INT4_MAX = 2147483647;

const status = z.enum(OrderStatus);
const orderId = z.uuid().describe('Order id from create_order or list_orders');
const customerId = z.string().min(1).max(64).describe('Customer identifier, e.g. cust-1');

const items = z
  .array(
    z.object({
      sku: z.string().min(1).max(64).describe('Stock keeping unit, e.g. SKU-1001'),
      quantity: z.number().int().min(1).max(INT4_MAX),
      unitCents: z
        .number()
        .int()
        .min(0)
        .max(INT4_MAX)
        .describe('Unit price in minor units, 500 means 5.00'),
    }),
  )
  .min(1)
  .max(100)
  .describe('Order lines; totalCents is always derived from these server-side');

type OrderLine = { quantity: number; unitCents: number };

function storageOverflow(lines: OrderLine[]): boolean {
  return lines.reduce((total, line) => total + line.quantity * line.unitCents, 0) > INT4_MAX;
}

export function registerOrderTools(
  server: McpServer,
  orders: OrdersRpcService,
  allowWrites: boolean,
): void {
  server.registerTool(
    'list_orders',
    {
      title: 'List orders',
      description:
        'List orders with optional status and customer filters. Use this to find an order id before calling other tools.',
      inputSchema: {
        status: status.optional(),
        customerId: customerId.optional(),
        page: z.number().int().min(1).default(DEFAULT_PAGE),
        limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args): Promise<CallToolResult> => {
      const query: FindOrdersQueryDto = { page: args.page, limit: args.limit };

      if (args.status !== undefined) {
        query.status = args.status;
      }

      if (args.customerId !== undefined) {
        query.customerId = args.customerId;
      }

      try {
        return toolJson(await orders.findAll(query));
      } catch (error) {
        return toolFailure('list_orders', error);
      }
    },
  );

  server.registerTool(
    'get_order',
    {
      title: 'Get order',
      description: 'Fetch one order by id with its line items and derived totalCents.',
      inputSchema: { id: orderId },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }): Promise<CallToolResult> => {
      try {
        return toolJson(await orders.findOne(id));
      } catch (error) {
        return toolFailure('get_order', error);
      }
    },
  );

  if (!allowWrites) {
    return;
  }

  server.registerTool(
    'create_order',
    {
      title: 'Create order',
      description: `Create a ${OrderStatus.PENDING} order. totalCents is computed from the items and must not be supplied.`,
      inputSchema: { customerId, items },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ customerId: customer, items: lines }): Promise<CallToolResult> => {
      if (storageOverflow(lines)) {
        return toolError(`order total must not exceed ${INT4_MAX} minor units`);
      }

      try {
        return toolJson(await orders.create({ customerId: customer, items: lines }));
      } catch (error) {
        return toolFailure('create_order', error);
      }
    },
  );

  server.registerTool(
    'update_order',
    {
      title: 'Update order',
      description: `Change an order status, replace its items, or both. ${OrderStatus.SHIPPED} and ${OrderStatus.CANCELLED} are terminal and reject further updates. Set status to ${OrderStatus.CANCELLED} to cancel instead of deleting.`,
      inputSchema: {
        id: orderId,
        status: status.optional(),
        items: items.optional().describe('Replaces every existing line when provided'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args): Promise<CallToolResult> => {
      if (args.status === undefined && args.items === undefined) {
        return toolError('update_order needs at least one of status or items');
      }

      if (args.items !== undefined && storageOverflow(args.items)) {
        return toolError(`order total must not exceed ${INT4_MAX} minor units`);
      }

      const dto: UpdateOrderDto = {};

      if (args.status !== undefined) {
        dto.status = args.status;
      }

      if (args.items !== undefined) {
        dto.items = args.items;
      }

      try {
        return toolJson(await orders.update(args.id, dto));
      } catch (error) {
        return toolFailure('update_order', error);
      }
    },
  );

  server.registerTool(
    'delete_order',
    {
      title: 'Delete order',
      description: `Permanently delete an order. Only ${OrderStatus.PENDING} orders can be deleted. Prefer update_order with status ${OrderStatus.CANCELLED} to keep the record.`,
      inputSchema: { id: orderId },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ id }): Promise<CallToolResult> => {
      try {
        return toolJson(await orders.remove(id));
      } catch (error) {
        return toolFailure('delete_order', error);
      }
    },
  );
}
