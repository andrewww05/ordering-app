import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { DOCS_PATH, GLOBAL_PREFIX, configureApp } from './app/app.setup';
import { EnvironmentVariables } from './app/config/env.validation';

async function bootstrap(): Promise<void> {
  const logger = new Logger('ApiGateway');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const port: number = config.getOrThrow('API_GATEWAY_PORT', { infer: true });

  configureApp(app);
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Ordering API')
      .setDescription('Order management endpoints exposed by the api-gateway')
      .setVersion('1.0')
      .build(),
  );

  SwaggerModule.setup(DOCS_PATH, app, document);

  await app.listen(port);

  logger.log(`Listening on http://localhost:${port}/${GLOBAL_PREFIX}/v1`);
  logger.log(`API docs on http://localhost:${port}/${DOCS_PATH}`);
}

bootstrap();
