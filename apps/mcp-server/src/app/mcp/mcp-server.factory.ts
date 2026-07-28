import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../../constants';
import { EnvironmentVariables } from '../config/env.validation';
import { OrdersRpcService } from '../orders/orders.rpc-service';
import { registerOrderTools } from './order.tools';

const INSTRUCTIONS = [
  'These tools are the source of truth for order state; never guess an order id, status or total.',
  'Resolve an order with list_orders or get_order before mutating it.',
  'totalCents is always derived server-side from the line items.',
  'SHIPPED and CANCELLED are terminal and reject further updates.',
  'Only PENDING orders can be deleted; cancel by setting status to CANCELLED instead.',
].join(' ');

@Injectable()
export class McpServerFactory {
  private readonly allowWrites: boolean;

  constructor(
    private readonly orders: OrdersRpcService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.allowWrites = config.getOrThrow('MCP_ALLOW_WRITES', { infer: true });
  }

  create(): McpServer {
    const server = new McpServer(
      { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
    );

    registerOrderTools(server, this.orders, this.allowWrites);

    return server;
  }
}
