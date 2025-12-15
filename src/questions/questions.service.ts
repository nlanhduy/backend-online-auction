import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionTreeNode, QuestionWithUser } from './questions.type';

@Injectable()
export class QuestionsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async create(userId: string, dto: CreateQuestionDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: {
        seller: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product ${dto.productId} does not exist`);
    }

    if (dto.parentId) {
      const parent = await this.prisma.question.findUnique({
        where: { id: dto.parentId },
      });

      if (!parent) {
        throw new NotFoundException(`Parent question ${dto.parentId} does not exist`);
      }
    }

    const question = await this.prisma.question.create({
      data: {
        ...dto,
        userId,
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, role: true, avatar: true },
        },
      },
    });

    if (userId !== product.sellerId) {
      this.mailService
        .sendQuestionNotification({
          ownerEmail: product.seller.email,
          ownerName: product.seller.fullName,
          productName: product.name,
          productId: product.id,
          questionContent: dto.content,
          userName: question.user.fullName,
          userEmail: question.user.email,
          actionType: 'created',
          createdAt: question.createdAt,
        })
        .catch((error) => {
          // Log error but don't throw - email failure shouldn't break the API
          console.error('Failed to send question notification email:', error);
        });
    }

    return question;
  }

  async update(userId: string, questionId: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        product: {
          include: {
            seller: {
              select: { id: true, fullName: true, email: true },
            },
          },
        },
      },
    });

    if (!question) {
      throw new NotFoundException(`Question ${questionId} does not exist`);
    }

    if (question.isDeleted) {
      throw new ForbiddenException('Deleted questions cannot be edited');
    }

    if (question.userId !== userId) {
      throw new ForbiddenException('You can only edit your own questions');
    }

    const updatedQuestion = await this.prisma.question.update({
      where: { id: questionId },
      data: {
        content: dto.content,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, role: true, avatar: true },
        },
      },
    });

    // Send email notification if the user is not the product owner
    if (userId !== question.product.sellerId) {
      // Fire and forget - don't await to avoid blocking the response
      this.mailService
        .sendQuestionNotification({
          ownerEmail: question.product.seller.email,
          ownerName: question.product.seller.fullName,
          productName: question.product.name,
          productId: question.product.id,
          questionContent: dto.content,
          userName: updatedQuestion.user.fullName,
          userEmail: updatedQuestion.user.email,
          actionType: 'updated',
          createdAt: question.createdAt,
          updatedAt: updatedQuestion.updatedAt,
        })
        .catch((error) => {
          // Log error but don't throw - email failure shouldn't break the API
          console.error('Failed to send question notification email:', error);
        });
    }

    return updatedQuestion;
  }

  async delete(userId: string, questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundException(`Question ${questionId} does not exist`);
    }

    if (question.userId !== userId) {
      throw new ForbiddenException('You can only delete your own questions');
    }

    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        isDeleted: true,
        content: '[deleted]',
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: { id: true, fullName: true, role: true, avatar: true },
        },
      },
    });
  }

  async findAllByProduct(
    productId: string,
    currentUserIdRaw: string | null,
  ): Promise<QuestionTreeNode[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true },
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} does not exist`);
    }

    // FIX: convert "null" | "undefined" → real null
    const currentUserId =
      !currentUserIdRaw || currentUserIdRaw === 'null' || currentUserIdRaw === 'undefined'
        ? null
        : currentUserIdRaw;

    const questions: QuestionWithUser[] = await this.prisma.question.findMany({
      where: { productId },
      include: {
        user: {
          select: { id: true, fullName: true, role: true, avatar: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.buildTree(questions, currentUserId, product.sellerId);
  }

  private buildTree(
    items: QuestionWithUser[],
    currentUserId: string | null,
    sellerId: string,
  ): QuestionTreeNode[] {
    const map: Record<string, QuestionTreeNode> = {};
    const roots: QuestionTreeNode[] = [];

    items.forEach((item) => {
      const isOwner = item.user.id === sellerId;
      const isEditable =
        !item.isDeleted && currentUserId !== null && item.user.id === currentUserId;

      map[item.id] = {
        ...item,
        children: [],
        isOwner,
        isEditable,
      };
    });

    items.forEach((item) => {
      if (item.parentId && map[item.parentId]) {
        map[item.parentId].children.push(map[item.id]);
      } else {
        roots.push(map[item.id]);
      }
    });

    // sort newest first
    return roots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
