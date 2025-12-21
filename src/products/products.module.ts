import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SystemSettingsModule } from 'src/system-setting/system-settings.module';

@Module({
  imports:[PrismaModule, SystemSettingsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
