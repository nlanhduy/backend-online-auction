import { PrismaModule } from 'src/prisma/prisma.module';

import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { OrdersModule } from '../orders/orders.module';
import { PaymentController } from './payment.controller';
import { PaypalService } from './paypal.service';

@Module({
  imports: [ConfigModule, PrismaModule, forwardRef(() => OrdersModule)],
  controllers: [PaymentController],
  providers: [PaypalService],
  exports: [PaypalService],
})
export class PaymentModule {}
