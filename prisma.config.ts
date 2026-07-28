import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'apps/order-service/prisma/schema.prisma',
  migrations: {
    path: 'apps/order-service/prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
