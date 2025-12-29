import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UserRatingScore {
  score: number; // Phần trăm rating dương (0-100)
  total: number; // Tổng số lượng rating
  positive: number; // Số lượng rating dương
  negative: number; // Số lượng rating âm
}

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Tính điểm rating của user dựa trên positiveRating và negativeRating
   * Công thức: (positiveRating / (positiveRating + negativeRating)) * 100
   */
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

  /**
   * Kiểm tra xem user có được phép bid hay không
   * - Nếu chưa có đánh giá: phụ thuộc vào allowNewBidders của product
   * - Nếu đã có đánh giá: điểm phải >= 80%
   */
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
