import { HttpStatus } from '@nestjs/common';

export interface RpcErrorPayload {
  statusCode: number;
  message: string | string[];
  error: string;
}

export function rpcError(
  statusCode: HttpStatus,
  message: string | string[],
): RpcErrorPayload {
  return { statusCode, message, error: HttpStatus[statusCode] ?? 'ERROR' };
}

export function isRpcErrorPayload(value: unknown): value is RpcErrorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<RpcErrorPayload>;

  return (
    typeof candidate.statusCode === 'number' &&
    candidate.statusCode >= 400 &&
    candidate.statusCode <= 599 &&
    (typeof candidate.message === 'string' || Array.isArray(candidate.message))
  );
}
