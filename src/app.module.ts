import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDataSourceOptions } from './database/typeorm.config';
import { PostsModule } from './posts/posts.module';

const nodeEnv = process.env.NODE_ENV || 'local';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${nodeEnv}`,
    }),
    TypeOrmModule.forRoot({
      ...createDataSourceOptions(process.env),
      synchronize: false,
      migrationsRun: nodeEnv === 'production',
    }),
    PostsModule,
  ],
})
export class AppModule {}
