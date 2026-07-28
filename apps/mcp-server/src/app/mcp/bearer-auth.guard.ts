import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { EnvironmentVariables } from '../config/env.validation';

function digest(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

@Injectable()
export class BearerAuthGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.expected = digest(config.getOrThrow('MCP_AUTH_TOKEN', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const header = http.getRequest<Request>().headers.authorization;
    const token = this.extract(header);

    if (token === undefined || !timingSafeEqual(digest(token), this.expected)) {
      http.getResponse<Response>().setHeader('WWW-Authenticate', 'Bearer realm="mcp"');

      throw new UnauthorizedException('missing or invalid bearer token');
    }

    return true;
  }

  private extract(header: string | undefined): string | undefined {
    const separator = header?.indexOf(' ') ?? -1;

    if (header === undefined || separator === -1) {
      return undefined;
    }

    const value = header.slice(separator + 1).trim();

    if (header.slice(0, separator).toLowerCase() !== 'bearer' || value.length === 0) {
      return undefined;
    }

    return value;
  }
}
