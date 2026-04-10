import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDataSourceOptions } from '@src/database/typeorm.config';
import { LoggingModule } from '@src/common/logging/logging.module';
import { IdempotencyModule } from '@src/common/idempotency/idempotency.module';
import { PostsModule } from '@src/posts/posts.module';
import { AuthModule } from '@src/auth/auth.module';
import { HealthModule } from '@src/health/health.module';

const nodeEnv = process.env.NODE_ENV || 'local';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${nodeEnv}`,
    }),
    ThrottlerModule.forRoot({
      skipIf: () => process.env.THROTTLE_SKIP === 'true',
      throttlers: [
        { name: 'short', ttl: 1000, limit: 3 },
        { name: 'long', ttl: 60000, limit: 60 },
      ],
    }),
    EventEmitterModule.forRoot(),
    LoggingModule,
    IdempotencyModule,
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...createDataSourceOptions(process.env),
        synchronize: false,
        migrationsRun: nodeEnv === 'production',
      }),
    }),
    PostsModule,
    AuthModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
