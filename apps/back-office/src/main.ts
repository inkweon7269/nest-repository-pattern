import '@app/shared/instrumentation';
import {
  addTransactionalDataSource,
  initializeTransactionalContext,
} from 'typeorm-transactional';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Logger } from 'nestjs-pino';
import {
  applyCompressionMiddleware,
  applySecurityMiddleware,
  HttpExceptionFilter,
  LoggingInterceptor,
} from '@app/shared';
import { AppModule } from './app.module';

async function bootstrap() {
  initializeTransactionalContext();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  addTransactionalDataSource(app.get(DataSource));

  applySecurityMiddleware(app, {
    corsOriginEnvKey: 'BACK_OFFICE_CORS_ORIGINS',
  });
  applyCompressionMiddleware(app);

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(app.get(HttpExceptionFilter));
  app.useGlobalInterceptors(app.get(LoggingInterceptor));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const config = new DocumentBuilder()
    .setTitle('Admin API')
    .setDescription('NestJS Admin Management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.enableShutdownHooks();

  await app.listen(process.env.ADMIN_PORT ?? 3001);
}
void bootstrap();
