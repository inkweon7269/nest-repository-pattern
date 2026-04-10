import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheckResult,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import Redis from 'ioredis';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health Check' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.checkRedis(),
    ]);
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    const pong = await this.redis.ping();
    const isHealthy = pong === 'PONG';
    const indicator: HealthIndicatorResult = {
      redis: { status: isHealthy ? 'up' : 'down' },
    };

    if (!isHealthy) {
      throw new HealthCheckError('Redis health check failed', indicator);
    }

    return indicator;
  }
}
