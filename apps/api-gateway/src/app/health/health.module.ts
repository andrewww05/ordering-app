import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { OrdersModule } from '../orders/orders.module';
import { HealthController } from './health.controller';
import { OrderServiceHealthIndicator } from './order-service.health-indicator';

@Module({
  imports: [TerminusModule, OrdersModule],
  controllers: [HealthController],
  providers: [OrderServiceHealthIndicator],
})
export class HealthModule {}
