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
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isHttpException
      ? exception.message
      : 'Internal server error';

    if (status >= 500) {
      this.logger.error(
        { err: exception, statusCode: status },
        'Unhandled exception: %s',
        message,
      );
    } else if (status >= 400) {
      this.logger.warn(
        { statusCode: status, message },
        'Client error: %s',
        message,
      );
    }

    const responseBody = isHttpException
      ? exception.getResponse()
      : { statusCode: status, message };

    httpAdapter.reply(ctx.getResponse(), responseBody, status);
  }
}
