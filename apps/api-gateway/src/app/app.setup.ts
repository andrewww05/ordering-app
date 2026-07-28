import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { RpcExceptionFilter } from './common/filters/rpc-exception.filter';

export const GLOBAL_PREFIX = 'api';
export const DOCS_PATH = 'api/docs';

export function configureApp(app: INestApplication): void {
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
}
