import { UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from '../idempotency.interceptor';

export function Idempotent(): MethodDecorator {
  return UseInterceptors(IdempotencyInterceptor);
}
