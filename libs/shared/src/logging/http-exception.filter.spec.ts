import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let reply: jest.Mock;
  let loggerError: jest.Mock;
  let filter: HttpExceptionFilter;
  const response = {};

  function createHost(): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    reply = jest.fn();
    loggerError = jest.fn();
    const adapterHost = {
      httpAdapter: { reply },
    } as unknown as HttpAdapterHost;
    const logger = {
      setContext: jest.fn(),
      error: loggerError,
    } as unknown as PinoLogger;
    filter = new HttpExceptionFilter(adapterHost, logger);
  });

  it('HttpException은 로깅하지 않고 해당 상태 코드와 본문으로 응답한다', () => {
    const exception = new NotFoundException('Post with ID 1 not found');

    filter.catch(exception, createHost());

    expect(loggerError).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(response, exception.getResponse(), 404);
  });

  it('비-HttpException은 error 레벨로 로깅하고 500으로 변환해 응답한다', () => {
    const exception = new Error('unexpected failure');

    filter.catch(exception, createHost());

    expect(loggerError).toHaveBeenCalledWith(
      { err: exception },
      'Unhandled exception converted to 500',
    );
    expect(reply).toHaveBeenCalledWith(
      response,
      { statusCode: 500, message: 'Internal server error' },
      500,
    );
  });
});
