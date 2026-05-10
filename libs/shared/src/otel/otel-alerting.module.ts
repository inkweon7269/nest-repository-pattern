import { Module } from '@nestjs/common';
import { AppCacheModule } from '../cache/cache.module';
import { SlackModule } from '../slack/slack.module';
import { SlowQueryAlertHandler } from './slow-query-alert.handler';

/**
 * OpenTelemetry trace 기반 운영 알림(현재는 슬로우 쿼리만)을 NestJS DI 컨테이너에
 * 등록하는 모듈.
 *
 * - 알림 발송에 필요한 `SlackService`와 중복 제거에 필요한 `CacheService`를
 *   각각 `SlackModule` / `AppCacheModule`로 import한다.
 * - 실제 알림 처리기인 `SlowQueryAlertHandler`를 provider로 등록한다.
 *
 * service 와 back-office 양쪽 AppModule이 이 모듈을 import해야
 * `OnModuleInit` 후크가 실행되어 알림 기능이 동작하기 시작한다.
 *
 * `CacheService`가 내부에서 의존하는 `REDIS_CLIENT` 토큰은
 * `IdempotencyModule`이 `@Global`로 전역 등록하므로 여기서 추가 import할 필요는 없다.
 */
@Module({
  imports: [SlackModule, AppCacheModule],
  providers: [SlowQueryAlertHandler],
})
export class OtelAlertingModule {}
