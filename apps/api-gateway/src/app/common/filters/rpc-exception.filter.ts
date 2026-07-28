import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { isRpcErrorPayload } from '@ordering-app/contracts';
import type { Request, Response } from 'express';
import { TimeoutError } from 'rxjs';

@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = this.resolveStatus(exception, request);

    response.status(status).json({
      statusCode: status,
      message: this.resolveMessage(exception, status),
      error: HttpStatus[status] ?? 'ERROR',
      path: request.url,
    });
  }

  private resolveStatus(exception: unknown, request: Request): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    if (exception instanceof TimeoutError) {
      this.logger.error(`Order service did not respond in time for ${request.method} ${request.url}`);
      return HttpStatus.GATEWAY_TIMEOUT;
    }

    if (isRpcErrorPayload(exception)) {
      return exception.statusCode;
    }

    this.logger.error(`Unhandled failure for ${request.method} ${request.url}`, exception);

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveMessage(exception: unknown, status: number): string | string[] {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return body;
      }

      const message = (body as { message?: string | string[] }).message;

      return message ?? exception.message;
    }

    if (isRpcErrorPayload(exception)) {
      return exception.message;
    }

    if (status === HttpStatus.GATEWAY_TIMEOUT) {
      return 'Order service is unavailable';
    }

    return 'Internal server error';
  }
}
