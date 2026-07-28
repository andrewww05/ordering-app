import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OrderItemDto } from './order-item.dto';

export class CreateOrderDto {
  @ApiProperty({ example: 'cust-1', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  customerId: string;

  @ApiProperty({ type: [OrderItemDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
