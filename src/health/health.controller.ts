import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis-health.indicator';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health Check' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redisIndicator.isHealthy('redis'),
    ]);
  }
}
