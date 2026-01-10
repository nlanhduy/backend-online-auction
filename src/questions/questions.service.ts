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
        content: dto.content,
        productId: dto.productId,
        parentId: dto.parentId ?? null,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            avatar: true,
          },
        },
      },
    });

    const isSeller = userId === product.sellerId;
    const isReply = Boolean(dto.parentId);

    if (!isSeller) {
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
          context: 'BUYER_QUESTION',
        })
        .catch(console.error);
    }

    if (isSeller && isReply) {
      const [bidders, questioners] = await Promise.all([
        this.prisma.bid.findMany({
          where: { productId: product.id, rejected: false },
          select: { user: { select: { id: true, email: true, fullName: true } } },
        }),
        this.prisma.question.findMany({
          where: { productId: product.id, isDeleted: false },
          select: { user: { select: { id: true, email: true, fullName: true } } },
        }),
      ]);

      const recipients = new Map<string, { email: string; fullName: string }>();

      [...bidders, ...questioners].forEach(({ user }) => {
        if (user.id !== product.sellerId) {
          recipients.set(user.id, { email: user.email, fullName: user.fullName });
        }
      });

      recipients.forEach((recipient) => {
        this.mailService
          .sendQuestionNotification({
            ownerEmail: recipient.email,
            ownerName: recipient.fullName,
            productName: product.name,
            productId: product.id,
            questionContent: dto.content,
            userName: product.seller.fullName,
            userEmail: product.seller.email,
            actionType: 'created',
            createdAt: question.createdAt,
            context: 'SELLER_REPLY',
          })
          .catch(console.error);
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
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            avatar: true,
          },
        },
      },
    });

    const isSeller = userId === question.product.sellerId;
    const isReply = Boolean(question.parentId);

    if (!isSeller) {
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
          context: 'BUYER_QUESTION',
        })
        .catch(console.error);
    }

    if (isSeller && isReply) {
      const [bidders, questioners] = await Promise.all([
        this.prisma.bid.findMany({
          where: { productId: question.product.id, rejected: false },
          select: { user: { select: { id: true, email: true, fullName: true } } },
        }),
        this.prisma.question.findMany({
          where: { productId: question.product.id, isDeleted: false },
          select: { user: { select: { id: true, email: true, fullName: true } } },
        }),
      ]);

      const recipients = new Map<string, { email: string; fullName: string }>();

      [...bidders, ...questioners].forEach(({ user }) => {
        if (user.id !== question.product.sellerId) {
          recipients.set(user.id, { email: user.email, fullName: user.fullName });
        }
      });

      recipients.forEach((recipient) => {
        this.mailService
          .sendQuestionNotification({
            ownerEmail: recipient.email,
            ownerName: recipient.fullName,
            productName: question.product.name,
            productId: question.product.id,
            questionContent: dto.content,
            userName: question.product.seller.fullName,
            userEmail: question.product.seller.email,
            actionType: 'updated',
            createdAt: question.createdAt,
            updatedAt: updatedQuestion.updatedAt,
            context: 'SELLER_REPLY',
          })
          .catch(console.error);
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
