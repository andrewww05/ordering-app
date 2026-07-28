import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';
import { EnvironmentVariables } from './app/config/env.validation';

async function bootstrap(): Promise<void> {
  const logger = new Logger('OrderService');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  const rabbitmqUrl: string = config.getOrThrow('RABBITMQ_URL', { infer: true });
  const queue: string = config.getOrThrow('ORDER_QUEUE', { infer: true });
  const port: number = config.getOrThrow('ORDER_SERVICE_PORT', { infer: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue,
        queueOptions: { durable: true },
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
