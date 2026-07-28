import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';
import { EnvironmentVariables } from './app/config/env.validation';

async function bootstrap(): Promise<void> {
  const logger = new Logger('NotificationService');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  const rabbitmqUrl: string = config.getOrThrow('RABBITMQ_URL', { infer: true });
  const queue: string = config.getOrThrow('NOTIFICATIONS_QUEUE', { infer: true });
  const port: number = config.getOrThrow('NOTIFICATION_SERVICE_PORT', { infer: true });

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue,
        queueOptions: { durable: true },
        noAck: false,
      },
    },
    { inheritAppConfig: true },
  );

  app.enableShutdownHooks();

  await app.startAllMicroservices();
  await app.listen(port);

  logger.log(`Consuming ${queue} on RabbitMQ`);
  logger.log(`Health available on http://localhost:${port}/health`);
}

bootstrap();
