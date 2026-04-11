import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { createPinoHttpOptions } from './logging.config';
import { HttpExceptionFilter } from './http-exception.filter';
import { LoggingInterceptor } from './logging.interceptor';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: createPinoHttpOptions(process.env),
      }),
    }),
  ],
  providers: [HttpExceptionFilter, LoggingInterceptor],
})
export class LoggingModule {}
