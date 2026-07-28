import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { OrderServiceHealthIndicator } from './order-service.health-indicator';

@ApiExcludeController()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly orderService: OrderServiceHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.orderService.isHealthy('order-service')]);
  }
}
