import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface UserRatingScore {
  score: number;
  total: number;
  positive: number;
  negative: number;
}

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  async getUserRatingScore(userId: string): Promise<UserRatingScore> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        positiveRating: true,
        negativeRating: true,
      },
    });

    if (!user) {
      return { score: 0, total: 0, positive: 0, negative: 0 };
    }

    const total = user.positiveRating + user.negativeRating;
    const positive = user.positiveRating;
    const negative = user.negativeRating;

    if (total === 0) {
      return { score: 0, total: 0, positive, negative };
    }

    const score = (positive / total) * 100;

    return { score, total, positive, negative };
  }

  async canUserBid(userId: string, productAllowNewBidders: boolean): Promise<boolean> {
    const { score, total } = await this.getUserRatingScore(userId);

    // Chưa có đánh giá
    if (total === 0) {
      return productAllowNewBidders;
    }

    // Có đánh giá, phải >= 80%
    return score >= 80;
  }
}
