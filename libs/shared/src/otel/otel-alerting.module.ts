import { Module } from '@nestjs/common';
import { AppCacheModule } from '../cache/cache.module';
import { SlackModule } from '../slack/slack.module';
import { SlowQueryAlertHandler } from './slow-query-alert.handler';

/**
 * OTEL 기반 운영 알림(현재는 슬로우 쿼리)을 NestJS DI 컨테이너에 wire-up하는 모듈.
 * SlackService(알림 발사)와 CacheService(dedup)를 의존하며, 양쪽 앱(service / back-office)
 * 의 AppModule이 본 모듈을 import해야 SlowQueryAlertHandler가 OnModuleInit으로 등록된다.
 *
 * REDIS_CLIENT는 IdempotencyModule(@Global)이 이미 전역 제공하므로 별도 import 불필요.
 */
@Module({
  imports: [SlackModule, AppCacheModule],
  providers: [SlowQueryAlertHandler],
})
export class OtelAlertingModule {}
