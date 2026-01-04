/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/currentUser.decorator';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('order/:orderId/messages')
  @ApiOperation({
    summary: 'Get chat history',
    description: 'Get paginated chat messages for an order. Only buyer or seller can access.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiResponse({ status: 200, description: 'Chat messages retrieved' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getChatMessages(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.chatService.getChatMessages(orderId, user.id, page, limit);
  }

  @Post('order/:orderId/messages')
  @ApiOperation({
    summary: 'Send message via REST',
    description: 'Send a message in order chat. Only buyer or seller can send.',
  })
  @ApiResponse({ status: 201, description: 'Message sent' })
  @ApiResponse({ status: 400, description: 'Chat not available' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async sendMessage(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(orderId, user.id, dto.content);
  }

  @Post('order/:orderId/mark-read')
  @ApiOperation({
    summary: 'Mark messages as read',
    description: 'Mark all unread messages in order chat as read',
  })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  async markAsRead(@Param('orderId') orderId: string, @CurrentUser() user: any) {
    await this.chatService.markMessagesAsRead(orderId, user.id);
    return { success: true };
  }

  @Get('order/:orderId/unread-count')
  @ApiOperation({
    summary: 'Get unread message count',
    description: 'Get count of unread messages for an order',
  })
  @ApiResponse({ status: 200, description: 'Unread count' })
  async getUnreadCount(@Param('orderId') orderId: string, @CurrentUser() user: any) {
    const count = await this.chatService.getUnreadCount(orderId, user.id);
    return { count };
  }
}
