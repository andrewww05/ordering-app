import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { NOTIFICATION_SERVICE_RABBITMQ } from '../../constants';
import { EnvironmentVariables } from '../config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: NOTIFICATION_SERVICE_RABBITMQ,
        inject: [ConfigService],
        useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
          const url: string = config.getOrThrow('RABBITMQ_URL', { infer: true });
          const queue: string = config.getOrThrow('NOTIFICATIONS_QUEUE', { infer: true });

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
  providers: [OrdersService],
})
export class OrdersModule {}
