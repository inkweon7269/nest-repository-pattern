import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDataSourceOptions } from '@src/database/typeorm.config';
import { PostsModule } from '@src/posts/posts.module';
import { AuthModule } from '@src/auth/auth.module';

const nodeEnv = process.env.NODE_ENV || 'local';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${nodeEnv}`,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...createDataSourceOptions(process.env),
        synchronize: false,
        migrationsRun: nodeEnv === 'production',
      }),
    }),
    PostsModule,
    AuthModule,
  ],
})
export class AppModule {}
