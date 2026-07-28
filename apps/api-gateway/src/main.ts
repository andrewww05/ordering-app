import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { RpcExceptionFilter } from './app/common/filters/rpc-exception.filter';
import { EnvironmentVariables } from './app/config/env.validation';

const GLOBAL_PREFIX = 'api';
const DOCS_PATH = 'api/docs';

async function bootstrap(): Promise<void> {
  const logger = new Logger('ApiGateway');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const port: number = config.getOrThrow('API_GATEWAY_PORT', { infer: true });

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new RpcExceptionFilter());
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
