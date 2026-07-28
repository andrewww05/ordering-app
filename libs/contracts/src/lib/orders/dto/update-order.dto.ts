import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../order-status.enum';
import { OrderItemDto } from './order-item.dto';

export class UpdateOrderDto {
  @ApiPropertyOptional({ enum: OrderStatus, example: OrderStatus.CONFIRMED })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ type: [OrderItemDto], minItems: 1, maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}
