import { ChatModule } from 'src/chat/chat.module';

import { forwardRef, Module } from '@nestjs/common';

import { PaymentModule } from '../payment/payment.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PrismaModule, forwardRef(() => PaymentModule), ChatModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
