// questions.controller.ts
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CurrentUser } from 'src/common/decorators/currentUser.decorator';
import { Public } from 'src/common/decorators/public.decorator';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionsService } from './questions.service';

@ApiTags('questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Public()
  @Get('public/product/:productId')
  @ApiOperation({ summary: 'Get all questions for a product (Public)' })
  @ApiResponse({ status: 200, description: 'List of questions (public)' })
  findAllByProductPublic(@Param('productId') productId: string) {
    return this.questionsService.findAllByProduct(productId, null);
  }

  @Get('auth/product/:productId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all questions for a product (Auth)' })
  @ApiResponse({ status: 200, description: 'List of questions (auth)' })
  findAllByProductAuth(@Param('productId') productId: string, @CurrentUser() user: any) {
    return this.questionsService.findAllByProduct(productId, user?.id ?? null);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a question or reply' })
  @ApiResponse({ status: 201, description: 'Question created successfully' })
  @ApiResponse({ status: 404, description: 'Product or Parent Question not found' })
  @ApiBody({ type: CreateQuestionDto })
  create(@CurrentUser() user: any, @Body() createQuestionDto: CreateQuestionDto) {
    return this.questionsService.create(user.id, createQuestionDto);
  }

  @ApiBearerAuth('access-token')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edit a question or reply content' })
  @ApiResponse({ status: 200, description: 'Question updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not the question owner' })
  @ApiResponse({ status: 404, description: 'Question not found' })
  @ApiBody({ type: UpdateQuestionDto })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateQuestionDto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(user.id, id, updateQuestionDto);
  }

  @ApiBearerAuth('access-token')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a question or reply' })
  @ApiResponse({ status: 200, description: 'Question deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not the question owner' })
  @ApiResponse({ status: 404, description: 'Question not found' })
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.questionsService.delete(user.id, id);
  }
}
