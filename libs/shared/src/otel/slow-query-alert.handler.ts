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
 * SlowQuerySpanProcessor가 발사하는 SlowQueryInfo를 받아 Slack 알림으로 전달하는
 * NestJS 측 핸들러. SpanProcessor는 NestJS 부팅 전에 생성되어 DI에 접근할 수 없으므로,
 * 본 핸들러가 OnModuleInit 시점에 모듈 레벨 callback을 등록해 다리 역할을 한다.
 *
 * 동일 SQL 본문이 단시간에 반복 슬로우일 경우 알림 폭주를 막기 위해 SQL hash 기반
 * Redis dedup(60초 윈도우)을 적용한다. CacheService는 Fail-Open이므로 Redis 장애 시
 * dedup 효과만 사라지고 알림 자체는 계속 발사된다.
 */
@Injectable()
export class SlowQueryAlertHandler implements OnModuleInit {
  private readonly logger = new Logger(SlowQueryAlertHandler.name);

  constructor(
    private readonly slackService: SlackService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * NestJS 부팅 완료 시점에 호출된다. 이 시점부터 SpanProcessor가 buffer에 쌓아둔
   * 이전 이벤트와 이후 발생하는 모든 슬로우 쿼리 이벤트가 본 핸들러로 전달된다.
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
   * SQL 본문 SHA-1 hash 앞 16자리를 dedup 키로 사용한다(전체 hash는 과하고,
   * statement는 길이가 가변적이라 직접 키로 못 씀).
   * 동일 SQL이 60초 안에 다시 발생하면 Slack 알림을 생략한다.
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
