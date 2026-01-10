import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  private readonly ACTIVE_CHAT_STATUSES: readonly OrderStatus[] = [
    OrderStatus.PAYMENT_PENDING,
    OrderStatus.SHIPPING_INFO_PENDING,
    OrderStatus.SELLER_CONFIRMATION_PENDING,
    OrderStatus.IN_TRANSIT,
  ];

  async createChatForOrder(orderId: string) {
    const existingChat = await this.prisma.chat.findUnique({
      where: { orderId },
    });

    if (existingChat) {
      return existingChat;
    }

    return this.prisma.chat.create({
      data: { orderId },
    });
  }

  async validateChatAccess(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('You are not a participant of this order');
    }

    if (!this.ACTIVE_CHAT_STATUSES.includes(order.status)) {
      throw new BadRequestException('Chat is not available for this order status');
    }

    return order;
  }

  async sendMessage(orderId: string, userId: string, content: string) {
    await this.validateChatAccess(orderId, userId);

    let chat = await this.prisma.chat.findUnique({
      where: { orderId },
    });

    if (!chat) {
      chat = await this.createChatForOrder(orderId);
    }

    const message = await this.prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: userId,
        content,
      },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
          },
        },
      },
    });

    return message;
  }

  async getChatMessages(orderId: string, userId: string, page: number = 1, limit: number = 50) {
    await this.validateChatAccess(orderId, userId);

    const chat = await this.prisma.chat.findUnique({
      where: { orderId },
    });

    if (!chat) {
      return {
        messages: [],
        total: 0,
        page,
        limit,
        hasMore: false,
      };
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { chatId: chat.id },
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({
        where: { chatId: chat.id },
      }),
    ]);

    return {
      messages: messages.reverse(),
      total,
      page,
      limit,
      hasMore: skip + messages.length < total,
    };
  }

  async markMessagesAsRead(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const chat = await this.prisma.chat.findUnique({
      where: { orderId },
    });

    if (!chat) {
      return;
    }

    await this.prisma.message.updateMany({
      where: {
        chatId: chat.id,
        senderId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }

  async getUnreadCount(orderId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { orderId },
    });

    if (!chat) {
      return 0;
    }

    return this.prisma.message.count({
      where: {
        chatId: chat.id,
        senderId: { not: userId },
        isRead: false,
      },
    });
  }

  async getUserName(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });
    return user?.fullName;
  }
}
