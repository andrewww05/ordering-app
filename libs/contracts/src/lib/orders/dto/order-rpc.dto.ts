import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsUUID, ValidateNested } from 'class-validator';
import { UpdateOrderDto } from './update-order.dto';

export class OrderIdPayload {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}

export class UpdateOrderPayload extends OrderIdPayload {
  @ApiProperty({ type: UpdateOrderDto })
  @ValidateNested()
  @Type(() => UpdateOrderDto)
  dto: UpdateOrderDto;
}
