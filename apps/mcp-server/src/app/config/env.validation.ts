import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export const MIN_TOKEN_LENGTH = 24;

function toBoolean({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
}

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  RABBITMQ_URL: string;

  @IsString()
  @IsNotEmpty()
  ORDER_QUEUE: string;

  @IsInt()
  @Min(100)
  RPC_TIMEOUT_MS: number;

  @IsInt()
  @Min(1)
  @Max(65535)
  MCP_SERVER_PORT: number;

  @IsString()
  @MinLength(MIN_TOKEN_LENGTH)
  MCP_AUTH_TOKEN: string;

  @Transform(toBoolean)
  @IsBoolean()
  MCP_ALLOW_WRITES = true;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    excludeExtraneousValues: false,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');

    throw new Error(`Invalid mcp-server environment: ${details}`);
  }

  return validated;
}
