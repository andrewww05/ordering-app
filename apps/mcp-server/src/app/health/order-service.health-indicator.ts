import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { OrdersRpcService } from '../orders/orders.rpc-service';

@Injectable()
export class OrderServiceHealthIndicator {
  constructor(
    private readonly orders: OrdersRpcService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const session = this.healthIndicatorService.check(key);

    try {
      const result = await this.orders.ping();

      return result.status === 'ok'
        ? session.up()
        : session.down(`Unexpected status ${result.status}`);
    } catch (error) {
      return session.down(error instanceof Error ? error.message : 'Order service unreachable');
    }
  }
}
