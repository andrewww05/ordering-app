import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const session = this.healthIndicatorService.check(key);

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return session.up();
    } catch (error) {
      return session.down(error instanceof Error ? error.message : 'Database unreachable');
    }
  }
}
