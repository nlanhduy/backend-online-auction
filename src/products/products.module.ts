import { BidsModule } from 'src/bids/bids.module';
import { MailService } from 'src/mail/mail.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SystemSettingsModule } from 'src/system-setting/system-settings.module';

import { Module } from '@nestjs/common';

import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [PrismaModule, SystemSettingsModule, BidsModule],
  controllers: [ProductsController],
  providers: [ProductsService, MailService],
  exports: [ProductsService],
})
export class ProductsModule {}
