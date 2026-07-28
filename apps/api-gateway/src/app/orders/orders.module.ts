import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ORDER_SERVICE_RABBITMQ } from '../../constants';
import { EnvironmentVariables } from '../config/env.validation';
import { OrdersController } from './orders.controller';
import { OrdersGatewayService } from './orders.gateway-service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: ORDER_SERVICE_RABBITMQ,
        inject: [ConfigService],
        useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
          const url: string = config.getOrThrow('RABBITMQ_URL', { infer: true });
          const queue: string = config.getOrThrow('ORDER_QUEUE', { infer: true });

          return {
            transport: Transport.RMQ as const,
            options: {
              urls: [url],
              queue,
              queueOptions: { durable: true },
            },
          };
        },
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersGatewayService],
  exports: [OrdersGatewayService],
})
export class OrdersModule {}
