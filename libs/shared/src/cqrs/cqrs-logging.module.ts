import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { UnhandledEventExceptionsLogger } from './unhandled-event-exceptions.logger';

/**
 * EventBus 이벤트 핸들러의 unhandled exception을 중앙 로깅하는 모듈.
 * EventBus로 이벤트를 발행하는 앱의 AppModule에서 import한다.
 */
@Module({
  imports: [CqrsModule],
  providers: [UnhandledEventExceptionsLogger],
})
export class CqrsLoggingModule {}
