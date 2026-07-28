import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MCP_ENDPOINT } from '../../constants';
import { BearerAuthGuard } from './bearer-auth.guard';
import { McpServerFactory } from './mcp-server.factory';

@Controller(MCP_ENDPOINT)
@UseGuards(BearerAuthGuard)
export class McpController {
  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  async handle(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    if (Array.isArray(body)) {
      response.status(HttpStatus.BAD_REQUEST).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'batched requests are not supported' },
        id: null,
      });
      return;
    }

    const server = this.factory.create();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    response.on('close', () => {
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  }

  @Get()
  stream(@Res() response: Response): void {
    this.methodNotAllowed(response);
  }

  @Delete()
  terminate(@Res() response: Response): void {
    this.methodNotAllowed(response);
  }

  private methodNotAllowed(response: Response): void {
    response.status(HttpStatus.METHOD_NOT_ALLOWED).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'server is stateless, only POST is supported' },
      id: null,
    });
  }
}
