import { MailService } from 'src/mail/mail.service';

import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, PrismaService, MailService],
})
export class QuestionsModule {}
