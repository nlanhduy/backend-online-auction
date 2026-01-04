/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Server, Socket } from 'socket.io';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { ChatService } from './chat.service';
import { JoinChatDto } from './dto/join-chat.dto';

export interface AuthenticatedSocket extends Socket {
  user?: {
    sub: string;
    email: string;
    role: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>();

  constructor(
    private chatService: ChatService,
    private jwtService: JwtService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const token = client.handshake.auth.token;

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      client.user = payload;
    } catch (err: any) {
      client.emit('jwt_error', {
        message: err.message,
        reason: 'expired',
      });
      client.disconnect();
      return;
    }

    const userId = client.user!.sub;
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.user?.sub;
    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    }
  }

  @SubscribeMessage('join_order_chat')
  async handleJoinChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinChatDto,
  ) {
    try {
      const userId = client.user!.sub;
      await this.chatService.validateChatAccess(data.orderId, userId);

      const roomName = `order_${data.orderId}`;
      await client.join(roomName);

      const unreadCount = await this.chatService.getUnreadCount(data.orderId, userId);

      client.emit('joined_chat', {
        orderId: data.orderId,
        roomName,
        unreadCount,
      });

      return { success: true, roomName };
    } catch (error: any) {
      client.emit('error', {
        message: error.message,
        event: 'join_order_chat',
      });
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('leave_order_chat')
  async handleLeaveChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinChatDto,
  ) {
    const roomName = `order_${data.orderId}`;
    await client.leave(roomName);
    return { success: true };
  }
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { orderId: string; content: string },
    callback: (response: any) => void,
  ) {
    try {
      const userId = client.user!.sub;
      const message = await this.chatService.sendMessage(data.orderId, userId, data.content);

      const roomName = `order_${data.orderId}`;
      this.server.to(roomName).emit('new_message', message);

      callback({ success: true, message });

      return { success: true, message };
    } catch (error: any) {
      const errResponse = { success: false, error: error.message };
      callback(errResponse);
      client.emit('error', {
        message: error.message,
        event: 'send_message',
      });
      return errResponse;
    }
  }

  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: JoinChatDto,
  ) {
    try {
      const userId = client.user!.sub;
      await this.chatService.markMessagesAsRead(data.orderId, userId);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('user_typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { orderId: string; isTyping: boolean },
  ) {
    const roomName = `order_${data.orderId}`;
    const userId = client.user?.sub;

    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    const fullName = await this.chatService.getUserName(userId);

    client.to(roomName).emit('user_typing', {
      userId,
      isTyping: data.isTyping,
      fullName,
    });

    return { success: true };
  }
}
