import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '@nestjs/common';
import { isRpcErrorPayload } from '@ordering-app/contracts';
import { TimeoutError } from 'rxjs';

const logger = new Logger('McpTools');

export function toolJson(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function toolFailure(tool: string, error: unknown): CallToolResult {
  if (error instanceof TimeoutError) {
    logger.error(`${tool}: order-service did not respond in time`);

    return toolError('order-service did not respond in time, retry in a moment');
  }

  if (isRpcErrorPayload(error)) {
    const message = Array.isArray(error.message) ? error.message.join('; ') : error.message;

    return toolError(`${tool} rejected with ${error.statusCode} ${error.error}: ${message}`);
  }

  logger.error(`${tool}: unhandled failure`, error);

  return toolError(`${tool} failed unexpectedly`);
}
