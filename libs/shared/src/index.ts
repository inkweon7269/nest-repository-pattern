// Entities
export { BaseTimeEntity } from './entities/base.entity';
export { User } from './entities/user.entity';
export { Post } from './entities/post.entity';
export { Tag } from './entities/tag.entity';
export { Admin } from './entities/admin.entity';
export { OAuthAccount } from './entities/oauth-account.entity';

// Enum
export { AdminRole } from './enum/admin-role.enum';

// Database
export { createDataSourceOptions } from './database/typeorm.config';
export { isUniqueViolation } from './database/postgres-error.util';

// Common - Base Repository
export { BaseRepository } from './common/base.repository';

// Common - Security Constants
export { BCRYPT_SALT_ROUNDS } from './common/security.constant';

// Common - DTOs
export {
  PaginatedResponseDto,
  PaginationMeta,
} from './common/dto/response/paginated.response.dto';
export { PaginationRequestDto } from './common/dto/request/pagination.request.dto';

// Common - Query
export { PaginatedQuery } from './common/query/paginated.query';

// Auth Types
export type { AuthTokens } from './auth.types';

// Cache
export { AppCacheModule } from './cache/cache.module';
export { CacheService } from './cache/cache.service';

// CQRS
export { CqrsLoggingModule } from './cqrs/cqrs-logging.module';
export { UnhandledEventExceptionsLogger } from './cqrs/unhandled-event-exceptions.logger';

// Logging
export { LoggingModule } from './logging/logging.module';
export { HttpExceptionFilter } from './logging/http-exception.filter';
export { LoggingInterceptor } from './logging/logging.interceptor';
export { createPinoHttpOptions } from './logging/logging.config';

// Idempotency
export { IdempotencyModule } from './idempotency/idempotency.module';
export { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
export { Idempotent } from './idempotency/decorator/idempotent.decorator';

// Slack
export { SlackModule } from './slack/slack.module';
export { SlackService } from './slack/slack.service';
export { SLACK_CHANNELS } from './slack/slack.channels';

// Health
export { HealthModule } from './health/health.module';
export { HealthController } from './health/health.controller';
export { RedisHealthIndicator } from './health/redis-health.indicator';

// Instrumentation
export {} from './instrumentation';

// OTEL Alerting
export { OtelAlertingModule } from './otel/otel-alerting.module';
export { SlowQueryAlertHandler } from './otel/slow-query-alert.handler';
export type { SlowQueryInfo } from './otel/slow-query-span-processor';

// Bootstrap - Security
export {
  applySecurityMiddleware,
  type CorsOriginEnvKey,
  type SecurityOptions,
} from './bootstrap/security';

// Bootstrap - Compression
export {
  applyCompressionMiddleware,
  type CompressionOptions,
} from './bootstrap/compression';
