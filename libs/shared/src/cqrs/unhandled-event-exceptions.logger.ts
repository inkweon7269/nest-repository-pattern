import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { UnhandledExceptionBus } from '@nestjs/cqrs';
import { Subject, takeUntil } from 'rxjs';

/**
 * EventBus 이벤트 핸들러의 예외는 request-response cycle 밖에서 발생하므로
 * Exception filter가 잡을 수 없다. EventBus 내장 catchError가 예외를
 * UnhandledExceptionBus로 발행하므로, 이를 구독하여 중앙에서 로깅한다.
 *
 * UnhandledExceptionBus는 CqrsModule이 export하는 앱 전체 싱글톤이므로
 * 이 로거 하나가 앱 내 모든 이벤트 핸들러 예외를 관측한다.
 */
@Injectable()
export class UnhandledEventExceptionsLogger implements OnModuleDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly logger = new Logger(UnhandledEventExceptionsLogger.name);

  constructor(unhandledExceptionBus: UnhandledExceptionBus) {
    unhandledExceptionBus.pipe(takeUntil(this.destroy$)).subscribe((info) => {
      this.logger.error(
        `Unhandled exception in event handler for ${info.cause?.constructor?.name ?? 'unknown event'}`,
        info.exception instanceof Error
          ? info.exception.stack
          : String(info.exception),
      );
    });
  }

  onModuleDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
