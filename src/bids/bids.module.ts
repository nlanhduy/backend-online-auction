import { Module } from '@nestjs/common';
import { BidsService } from './bids.service';
import { BidsController } from './bids.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RatingsService } from './ratings.service';

@Module({
  imports: [PrismaModule],
  controllers: [BidsController],
  providers: [BidsService, RatingsService],
  exports: [BidsService, RatingsService],
})
export class BidsModule {}
