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

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
}

@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    if (exception instanceof HttpException) {
      this.sendHttpException(exception, request, response);
      return;
    }

    if (exception instanceof TimeoutError) {
      this.logger.error(
        `Order service did not respond in time for ${request.method} ${request.url}`,
      );

      this.send(response, HttpStatus.GATEWAY_TIMEOUT, 'Order service is unavailable', request);
      return;
    }

    if (isRpcErrorPayload(exception)) {
      this.send(response, exception.statusCode, exception.message, request);
      return;
    }

    this.logger.error(`Unhandled failure for ${request.method} ${request.url}`, exception);

    this.send(response, HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error', request);
  }

  private sendHttpException(
    exception: HttpException,
    request: Request,
    response: Response,
  ): void {
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'string') {
      this.send(response, status, body, request);
      return;
    }

    const message = (body as { message?: string | string[] }).message;

    if (message === undefined) {
      response.status(status).json(body);
      return;
    }

    this.send(response, status, message, request);
  }

  private send(
    response: Response,
    status: number,
    message: string | string[],
    request: Request,
  ): void {
    const body: ErrorBody = {
      statusCode: status,
      message,
      error: HttpStatus[status] ?? 'ERROR',
      path: request.url,
    };

    response.status(status).json(body);
  }
}
