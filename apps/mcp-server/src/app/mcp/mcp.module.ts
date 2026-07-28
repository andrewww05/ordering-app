import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { BearerAuthGuard } from './bearer-auth.guard';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';

@Module({
  imports: [OrdersModule],
  controllers: [McpController],
  providers: [BearerAuthGuard, McpServerFactory],
})
export class McpModule {}
