import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HttpExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const isHttpException = exception instanceof HttpException;

    // 가드/미들웨어 단계의 비-HttpException은 LoggingInterceptor가 잡지 못하므로
    // 500으로 변환하기 전에 여기서 stack을 남긴다 (마지막 안전망).
    if (!isHttpException) {
      this.logger.error(
        { err: exception },
        'Unhandled exception converted to 500',
      );
    }

    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = isHttpException
      ? exception.getResponse()
      : { statusCode: status, message: 'Internal server error' };

    httpAdapter.reply(ctx.getResponse(), responseBody, status);
  }
}
