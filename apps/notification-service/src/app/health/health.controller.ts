import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RmqOptions, Transport } from '@nestjs/microservices';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  MicroserviceHealthIndicator,
} from '@nestjs/terminus';
import { EnvironmentVariables } from '../config/env.validation';

@Controller('health')
export class HealthController {
  private readonly rabbitmqUrl: string;
  private readonly queue: string;

  constructor(
    private readonly health: HealthCheckService,
    private readonly microservice: MicroserviceHealthIndicator,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.rabbitmqUrl = config.getOrThrow('RABBITMQ_URL', { infer: true });
    this.queue = config.getOrThrow('NOTIFICATIONS_QUEUE', { infer: true });
  }

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () =>
        this.microservice.pingCheck<RmqOptions>('rabbitmq', {
          transport: Transport.RMQ,
          timeout: 3000,
          options: {
            urls: [this.rabbitmqUrl],
            queue: this.queue,
            queueOptions: { durable: true },
          },
        }),
    ]);
  }
}
