import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { OtpModule } from '../otp/otp.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './user.controller';
import { UsersService } from './user.service';

@Module({
  imports: [PrismaModule, OtpModule, MailModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
