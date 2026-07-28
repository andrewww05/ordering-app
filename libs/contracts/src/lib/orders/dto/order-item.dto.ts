import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class OrderItemDto {
  @ApiProperty({ example: 'SKU-1001', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 500, minimum: 0, description: 'Unit price in minor units' })
  @IsInt()
  @Min(0)
  unitCents: number;
}
