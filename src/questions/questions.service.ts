import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionTreeNode, QuestionWithUser } from './questions.type';

@Injectable()
export class QuestionsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateQuestionDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
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

    return this.prisma.question.create({
      data: {
        ...dto,
        userId,
      },
      include: {
        user: {
          select: { id: true, fullName: true, role: true, avatar: true },
        },
      },
    });
  }

  async update(userId: string, questionId: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
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

    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        content: dto.content,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: { id: true, fullName: true, role: true, avatar: true },
        },
      },
    });
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
      const isOwner = currentUserId === sellerId;
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
