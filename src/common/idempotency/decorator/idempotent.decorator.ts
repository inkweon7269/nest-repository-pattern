import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from '../idempotency.interceptor';

export const IDEMPOTENT_KEY = 'isIdempotent';

export function Idempotent(): MethodDecorator {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, true),
    UseInterceptors(IdempotencyInterceptor),
  );
}
