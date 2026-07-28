import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  RABBITMQ_URL: string;

  @IsString()
  @IsNotEmpty()
  ORDER_QUEUE: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  API_GATEWAY_PORT: number;

  @IsInt()
  @Min(100)
  RPC_TIMEOUT_MS: number;
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

    throw new Error(`Invalid api-gateway environment: ${details}`);
  }

  return validated;
}
