import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  RABBITMQ_URL: string;

  @IsString()
  @IsNotEmpty()
  NOTIFICATIONS_QUEUE: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  NOTIFICATION_SERVICE_PORT: number;
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

    throw new Error(`Invalid notification-service environment: ${details}`);
  }

  return validated;
}
