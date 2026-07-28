import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @MessagePattern("order-created")
  handleOrderCreated(@Payload() order: any) {
    console.log('Order service: Handling new order')
  }
}
