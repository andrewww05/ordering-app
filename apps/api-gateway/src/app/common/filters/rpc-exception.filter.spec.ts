import { ArgumentsHost, BadRequestException, HttpStatus, Logger } from '@nestjs/common';
import { TimeoutError } from 'rxjs';
import { RpcExceptionFilter } from './rpc-exception.filter';

describe('RpcExceptionFilter', () => {
  let filter: RpcExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    filter = new RpcExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });

    host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/orders/abc', method: 'GET' }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps a structured rpc error payload to its status', () => {
    filter.catch({ statusCode: 404, message: 'Order abc not found', error: 'NOT_FOUND' }, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Order abc not found',
      error: 'NOT_FOUND',
      path: '/api/v1/orders/abc',
    });
  });

  it('maps a conflict payload to 409', () => {
    filter.catch({ statusCode: 409, message: 'Already shipped', error: 'CONFLICT' }, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
  });

  it('maps an rxjs timeout to 504 without leaking internals', () => {
    filter.catch(new TimeoutError(), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.GATEWAY_TIMEOUT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 504, message: 'Order service is unavailable' }),
    );
  });

  it('normalises a local HttpException and keeps its messages', () => {
    filter.catch(new BadRequestException(['customerId should not be empty']), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['customerId should not be empty'],
        error: 'BAD_REQUEST',
      }),
    );
  });

  it('falls back to 500 and hides the cause for an unknown failure', () => {
    filter.catch(new Error('connection string: postgres://user:secret@host'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
    );
    expect(JSON.stringify(json.mock.calls[0])).not.toContain('secret');
  });

  it('rejects an out of range statusCode as an unknown failure', () => {
    filter.catch({ statusCode: 999, message: 'nope' }, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('passes a terminus style health body through untouched', () => {
    const healthBody = {
      status: 'error',
      info: {},
      error: { 'order-service': { status: 'down', message: 'Timeout has occurred' } },
      details: { 'order-service': { status: 'down', message: 'Timeout has occurred' } },
    };

    filter.catch(
      new (class extends BadRequestException {
        constructor() {
          super(healthBody);
        }
      })(),
      host,
    );

    expect(json).toHaveBeenCalledWith(healthBody);
  });
});
