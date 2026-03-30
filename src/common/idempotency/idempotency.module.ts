import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        }),
    },
    IdempotencyInterceptor,
  ],
  exports: ['REDIS_CLIENT', IdempotencyInterceptor],
})
export class IdempotencyModule {}
