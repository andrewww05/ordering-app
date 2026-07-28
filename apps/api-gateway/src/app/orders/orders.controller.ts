import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGatewayTimeoutResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateOrderDto,
  FindOrdersQueryDto,
  OrderResponse,
  PaginatedOrdersResponse,
  UpdateOrderDto,
} from '@ordering-app/contracts';
import { OrdersGatewayService } from './orders.gateway-service';

@ApiTags('orders')
@ApiBadRequestResponse({ description: 'Payload failed validation' })
@ApiGatewayTimeoutResponse({ description: 'Order service did not respond in time' })
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersGatewayService) {}

  @Post()
  @ApiOperation({ summary: 'Create an order' })
  @ApiCreatedResponse({ type: OrderResponse })
  create(@Body() dto: CreateOrderDto): Promise<OrderResponse> {
    return this.orders.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List orders' })
  @ApiOkResponse({ type: PaginatedOrdersResponse })
  findAll(@Query() query: FindOrdersQueryDto): Promise<PaginatedOrdersResponse> {
    return this.orders.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiNotFoundResponse({ description: 'Order does not exist' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponse> {
    return this.orders.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an order status or items' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiNotFoundResponse({ description: 'Order does not exist' })
  @ApiConflictResponse({ description: 'Order is shipped or cancelled' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<OrderResponse> {
    return this.orders.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a pending order' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Order deleted' })
  @ApiNotFoundResponse({ description: 'Order does not exist' })
  @ApiConflictResponse({ description: 'Only pending orders can be deleted' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.orders.remove(id);
  }
}
