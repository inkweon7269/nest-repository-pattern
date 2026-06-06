import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  createDataSourceOptions,
  LoggingModule,
  IdempotencyModule,
  HealthModule,
} from '@app/shared';
import { AuthModule } from '../../apps/service/src/auth/auth.module';
import { AdminModule } from '../../apps/back-office/src/auth/admin.module';

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
    LoggingModule,
    IdempotencyModule,
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...createDataSourceOptions(process.env),
        synchronize: false,
      }),
    }),
    AuthModule,
    AdminModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AdminTestModule {}
