import { createHash } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { SlackService } from '../slack/slack.service';
import {
  registerSlowQueryHandler,
  SlowQueryInfo,
} from './slow-query-span-processor';

const DEDUP_TTL_SECONDS = 60;
const DEDUP_KEY_HASH_LENGTH = 16;

/**
 * `SlowQuerySpanProcessor`가 만든 `SlowQueryInfo`를 받아 Slack 알림으로 보내는
 * NestJS 핸들러.
 *
 * SpanProcessor는 NestJS DI 컨테이너가 만들어지기 전에 시작되므로 SlackService를
 * 직접 주입받을 수 없다. 그래서 NestJS 부팅이 끝난 시점(OnModuleInit)에 이 핸들러가
 * 모듈 레벨 콜백을 등록해 둘 사이를 잇는 다리가 된다.
 *
 * 같은 SQL이 짧은 시간에 여러 번 느려져도 Slack에 같은 메시지가 도배되지 않도록,
 * SQL 본문의 해시를 키로 한 60초짜리 Redis 중복 제거(dedup)를 적용한다.
 * `CacheService`는 Redis 장애 시에도 예외를 던지지 않고 조용히 통과(Fail-Open)하므로,
 * Redis가 죽으면 dedup 효과만 사라지고 알림은 평소처럼 계속 발사된다.
 */
@Injectable()
export class SlowQueryAlertHandler implements OnModuleInit {
  private readonly logger = new Logger(SlowQueryAlertHandler.name);

  constructor(
    private readonly slackService: SlackService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * NestJS가 모든 모듈을 초기화한 직후 한 번 호출된다.
   * 이 시점에 SpanProcessor 쪽에 콜백을 등록하면:
   *   (1) 등록 직전까지 buffer에 쌓여 있던 슬로우 쿼리가 즉시 콜백으로 흘러오고
   *   (2) 이후 발생하는 모든 슬로우 쿼리도 같은 콜백으로 들어온다.
   *
   * 알림 처리 자체가 실패하더라도 메인 흐름이 깨지지 않도록 `catch`에서
   * `logger.warn`으로만 흡수한다(예외를 던지면 boot-time 콜백이라 unhandled rejection이 됨).
   */
  onModuleInit(): void {
    registerSlowQueryHandler((info) => {
      void this.handle(info).catch((error) => {
        this.logger.warn(
          `Slow query alert handling failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });
  }

  /**
   * Redis 중복 제거 키는 `slow-query:{SQL 본문의 SHA-1 해시 앞 16자}` 형태로 만든다.
   * SQL 본문은 길이가 가변적이라 그대로 키로 쓸 수 없고, 전체 해시(40자)는 길이가 과하다.
   * 16자(64비트)면 충돌 확률이 사실상 0이라 dedup 정확도에 문제 없다.
   *
   * 같은 SQL이 60초 안에 다시 슬로우로 잡히면 키가 이미 존재해 Slack 발송을 건너뛴다.
   */
  private async handle(info: SlowQueryInfo): Promise<void> {
    const dedupKey = `slow-query:${createHash('sha1')
      .update(info.statement)
      .digest('hex')
      .slice(0, DEDUP_KEY_HASH_LENGTH)}`;

    const exists = await this.cacheService.get<string>(dedupKey);
    if (exists) return;

    await this.cacheService.set(dedupKey, '1', DEDUP_TTL_SECONDS);
    await this.slackService.sendSlowQueryAlert(info);
  }
}
