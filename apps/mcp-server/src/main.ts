import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { EnvironmentVariables } from './app/config/env.validation';
import { MCP_ENDPOINT } from './constants';

async function bootstrap(): Promise<void> {
  const logger = new Logger('McpServer');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const port: number = config.getOrThrow('MCP_SERVER_PORT', { infer: true });

  app.enableShutdownHooks();

  await app.listen(port);

  logger.log(`MCP endpoint on http://localhost:${port}/${MCP_ENDPOINT}`);
  logger.log(`Health available on http://localhost:${port}/health`);
}

bootstrap();
