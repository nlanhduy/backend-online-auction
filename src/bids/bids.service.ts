import { maskFullName } from 'src/common/utils/mask-name.util';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BidResponseDto } from './dto/bid-response.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { ValidateBidResponseDto } from './dto/validate-bid.dto';
import { RatingsService } from './ratings.service';

@Injectable()
export class BidsService {
  constructor(
    private prisma: PrismaService,
    private ratingsService: RatingsService,
  ) {}

  // Validate if user can bid on a product
  // return user if valid
  async validateBid(productId: string, userId: string): Promise<ValidateBidResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        bids: {
          orderBy: { amount: 'desc' },
          take: 1,
        },
      },
    });
    const hasBid = await this.prisma.bid.findFirst({
      where: {
        productId,
        userId,
      },
      select: {
        id: true,
      },
    });

    const isBidding = Boolean(hasBid);

    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    // Check if the user is the seller
    if (product.sellerId === userId) {
      return {
        canBid: false,
        suggestedAmount: 0,
        currentPrice: product.currentPrice,
        stepPrice: product.priceStep,
        userRatingScore: 0,
        userTotalRatings: 0,
        message: 'You cannot bid on your own product.',
        isSeller: true,
        isBidding: false,
      };
    }

    // Check product status
    if (product.status !== 'ACTIVE') {
      return {
        canBid: false,
        suggestedAmount: 0,
        currentPrice: product.currentPrice,
        stepPrice: product.priceStep,
        userRatingScore: 0,
        userTotalRatings: 0,
        message: 'Sản phẩm này không còn hoạt động',
        isSeller: false,
        isBidding: false,
      };
    }

    // Check bid time
    if (new Date() > product.endTime) {
      return {
        canBid: false,
        suggestedAmount: 0,
        currentPrice: product.currentPrice,
        stepPrice: product.priceStep,
        userRatingScore: 0,
        userTotalRatings: 0,
        message: 'Phiên đấu giá đã kết thúc',
        isSeller: false,
        isBidding: false,
      };
    }

    if (new Date() < product.startTime) {
      return {
        canBid: false,
        suggestedAmount: 0,
        currentPrice: product.currentPrice,
        stepPrice: product.priceStep,
        userRatingScore: 0,
        userTotalRatings: 0,
        message: 'Phiên đấu giá chưa bắt đầu',
        isSeller: false,
        isBidding: false,
      };
    }

    const canBid = await this.ratingsService.canUserBid(userId, product.allowNewBidders);
    const { score, total } = await this.ratingsService.getUserRatingScore(userId);

    const suggestedAmount = product.currentPrice + product.priceStep;

    let message = '';
    if (!canBid) {
      if (total === 0) {
        message =
          'You do not have any ratings yet. The seller does not allow new bidders to participate in this auction.';
      } else {
        message = `Your rating score is ${score.toFixed(
          1,
        )}% (${total} ratings). You need a rating score of at least 80% to participate in this auction.`;
      }
    }

    return {
      canBid,
      suggestedAmount,
      currentPrice: product.currentPrice,
      stepPrice: product.priceStep,
      userRatingScore: score,
      userTotalRatings: total,
      message: message || undefined,
      isSeller: false,
      isBidding,
    };
  }

  async placeBid(placeBidDto: PlaceBidDto, userId: string): Promise<BidResponseDto> {
    const { productId, amount, maxAmount, confirmed } = placeBidDto;

    // Validate bid
    const validation = await this.validateBid(productId, userId);

    if (!validation.canBid) {
      throw new ForbiddenException(validation.message);
    }

    // Check confirmation
    if (!confirmed) {
      throw new BadRequestException('Please confirm before placing a bid');
    }

    // Check bid amount
    if (amount < validation.suggestedAmount) {
      throw new BadRequestException(
        `Bid amount must be ≥ ${validation.suggestedAmount.toLocaleString('vi-VN')} VND (current price + step price)`,
      );
    }

    // Validate maxAmount nếu có
    if (maxAmount !== undefined && maxAmount !== null) {
      if (maxAmount < amount) {
        throw new BadRequestException('Max amount must be greater than or equal to bid amount');
      }
    }

    // Xử lý trong transaction
    return await this.prisma.$transaction(async (tx) => {
      // 1. Lấy product với thông tin hiện tại
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          currentPrice: true,
          priceStep: true,
          winnerId: true,
        },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      // 2. Tìm bid với maxAmount cao nhất từ người khác (không bị rejected)
      const competitorMaxBid = await tx.bid.findFirst({
        where: {
          productId,
          userId: { not: userId },
          rejected: false,
          maxAmount: { not: null },
        },
        orderBy: [{ maxAmount: 'desc' }, { createdAt: 'asc' }],
      });

      // 3. Tính toán giá cuối cùng
      let finalAmount = amount;
      let shouldCreateCounterBid = false;
      let counterBidAmount: number | null = null;
      let counterBidUserId: string | null = null;

      const isAutoBid = maxAmount !== undefined && maxAmount !== null;

      if (isAutoBid && competitorMaxBid?.maxAmount) {
        // Logic đấu giá tự động khi cả 2 đều có maxAmount
        if (maxAmount > competitorMaxBid.maxAmount) {
          // User thắng: đặt giá cao hơn maxAmount của đối thủ 1 bước giá
          finalAmount = Math.min(competitorMaxBid.maxAmount + product.priceStep, maxAmount);
        } else if (maxAmount === competitorMaxBid.maxAmount) {
          // Ngang nhau: người đặt trước thắng
          throw new BadRequestException('Someone already placed the same maximum bid before you');
        } else {
          // User thua: đối thủ sẽ counter bid
          finalAmount = maxAmount;
          shouldCreateCounterBid = true;
          counterBidAmount = Math.min(maxAmount + product.priceStep, competitorMaxBid.maxAmount);
          counterBidUserId = competitorMaxBid.userId;
        }
      } else if (
        !isAutoBid &&
        competitorMaxBid?.maxAmount &&
        competitorMaxBid.maxAmount >= amount
      ) {
        // User không dùng auto bid nhưng đối thủ có auto bid và còn budget
        shouldCreateCounterBid = true;
        counterBidAmount = Math.min(amount + product.priceStep, competitorMaxBid.maxAmount);
        counterBidUserId = competitorMaxBid.userId;
      }

      // 4. Tạo bid của user
      const newBid = await tx.bid.create({
        data: {
          amount: finalAmount,
          maxAmount: maxAmount,
          isProxy: isAutoBid,
          productId,
          userId,
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      // 5. Cập nhật product và xử lý counter bid nếu cần
      let finalWinnerId = userId;
      let finalPrice = finalAmount;

      if (shouldCreateCounterBid && counterBidUserId && counterBidAmount) {
        // Tạo counter bid tự động
        await tx.bid.create({
          data: {
            amount: counterBidAmount,
            maxAmount: competitorMaxBid!.maxAmount,
            isProxy: true,
            productId,
            userId: counterBidUserId,
          },
        });

        finalWinnerId = counterBidUserId;
        finalPrice = counterBidAmount;
      }

      // 6. Cập nhật product với winnerId và currentPrice
      await tx.product.update({
        where: { id: productId },
        data: {
          currentPrice: finalPrice,
          winnerId: finalWinnerId,
        },
      });

      // 7. Return response
      const isWinning = finalWinnerId === userId;

      return {
        id: newBid.id,
        amount: newBid.amount.toString(),
        maxAmount: newBid.maxAmount?.toString(),
        isProxy: newBid.isProxy,
        productId: newBid.productId,
        userId: newBid.userId,
        userName: newBid.user.fullName,
        createdAt: newBid.createdAt.toISOString(),
        isWinning,
        currentPrice: finalPrice.toString(),
        message: isWinning
          ? isAutoBid
            ? `Đấu giá tự động đã kích hoạt! Bạn đang thắng với giá ${finalPrice.toLocaleString('vi-VN')} VND. Hệ thống sẽ tự động tăng giá cho bạn nếu có người khác đấu giá (tối đa: ${maxAmount.toLocaleString('vi-VN')} VND)`
            : `Đặt giá thành công ${amount.toLocaleString('vi-VN')} VND. Bạn đang dẫn đầu!`
          : `Giá đặt của bạn ${newBid.amount.toLocaleString('vi-VN')} VND đã bị vượt qua bởi đấu giá tự động. Giá hiện tại: ${finalPrice.toLocaleString('vi-VN')} VND`,
      };
    });
  }

  async getBidHistory(productId: string, requestingUserId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sellerId: true },
    });

    const bids = await this.prisma.bid.findMany({
      where: { productId, rejected: false },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Check if user is seller or admin
    const isSeller = product?.sellerId === requestingUserId;
    return bids.map((bid) => {
      const shouldMask = !isSeller && bid.userId !== requestingUserId;
      const isOwnBid = bid.userId === requestingUserId;

      return {
        id: bid.id,
        amount: bid.amount.toString(),
        maxAmount: isOwnBid ? bid.maxAmount?.toString() : undefined, // Chỉ show maxAmount cho chính user
        isProxy: bid.isProxy,
        createdAt: bid.createdAt,
        rejected: bid.rejected,
        user: {
          id: bid.user.id,
          fullName: shouldMask ? maskFullName(bid.user.fullName) : bid.user.fullName,
        },
        bidType: bid.isProxy ? 'auto' : 'manual', // Distinct bid type
      };
    });
  }

  async getMyCurrentBid(productId: string, userId: string) {
    // Lấy bid cao nhất của user cho product này
    const myBid = await this.prisma.bid.findFirst({
      where: {
        productId,
        userId,
        rejected: false,
      },
      orderBy: [{ amount: 'desc' }, { createdAt: 'desc' }],
      include: {
        product: {
          select: {
            currentPrice: true,
            winnerId: true,
          },
        },
      },
    });

    if (!myBid) {
      return null;
    }

    const isWinning = myBid.product.winnerId === userId;
    const hasMaxAmount = myBid.maxAmount !== null;

    let status: 'winning' | 'losing' | 'outbid' = 'losing';
    if (isWinning) {
      status = 'winning';
    } else if (hasMaxAmount && myBid.maxAmount! >= myBid.product.currentPrice) {
      status = 'outbid'; // Vẫn còn budget để auto bid
    }

    return {
      id: myBid.id,
      amount: myBid.amount,
      maxAmount: myBid.maxAmount,
      isProxy: myBid.isProxy,
      isWinning,
      status,
      currentPrice: myBid.product.currentPrice,
      remainingBudget: hasMaxAmount
        ? Math.max(0, myBid.maxAmount! - myBid.product.currentPrice)
        : 0,
      createdAt: myBid.createdAt,
    };
  }
} // Added business logic: seller and admin can see fullName
