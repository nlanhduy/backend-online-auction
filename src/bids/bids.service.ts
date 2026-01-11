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
      throw new NotFoundException('Product does not exist');
    }

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

    if (product.status !== 'ACTIVE') {
      return {
        canBid: false,
        suggestedAmount: 0,
        currentPrice: product.currentPrice,
        stepPrice: product.priceStep,
        userRatingScore: 0,
        userTotalRatings: 0,
        message: 'This product is no longer active',
        isSeller: false,
        isBidding: false,
      };
    }

    if (new Date() > product.endTime) {
      return {
        canBid: false,
        suggestedAmount: 0,
        currentPrice: product.currentPrice,
        stepPrice: product.priceStep,
        userRatingScore: 0,
        userTotalRatings: 0,
        message: 'The auction has ended',
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
        message: 'The auction has not started yet',
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

    const validation = await this.validateBid(productId, userId);

    if (!validation.canBid) {
      throw new ForbiddenException(validation.message);
    }

    if (!confirmed) {
      throw new BadRequestException('Please confirm before placing a bid');
    }

    if (amount < validation.suggestedAmount) {
      throw new BadRequestException(
        `Bid amount must be ≥ ${validation.suggestedAmount.toLocaleString('en-US')} VND (current price + step price)`,
      );
    }

    if (maxAmount !== undefined && maxAmount !== null) {
      if (maxAmount < amount) {
        throw new BadRequestException('Max amount must be greater than or equal to bid amount');
      }
    }

    return await this.prisma.$transaction(async (tx) => {
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

      const competitorMaxBid = await tx.bid.findFirst({
        where: {
          productId,
          userId: { not: userId },
          rejected: false,
          maxAmount: { not: null },
        },
        orderBy: [{ maxAmount: 'desc' }, { createdAt: 'asc' }],
      });

      let finalAmount = amount;
      let shouldCreateCounterBid = false;
      let counterBidAmount: number | null = null;
      let counterBidUserId: string | null = null;

      const isAutoBid = maxAmount !== undefined && maxAmount !== null;

      if (isAutoBid && competitorMaxBid?.maxAmount) {
        if (maxAmount > competitorMaxBid.maxAmount) {
          finalAmount = Math.min(competitorMaxBid.maxAmount + product.priceStep, maxAmount);
        } else if (maxAmount === competitorMaxBid.maxAmount) {
          throw new BadRequestException('Someone already placed the same maximum bid before you');
        } else {
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
        shouldCreateCounterBid = true;
        counterBidAmount = Math.min(amount + product.priceStep, competitorMaxBid.maxAmount);
        counterBidUserId = competitorMaxBid.userId;
      }

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

      let finalWinnerId = userId;
      let finalPrice = finalAmount;

      if (shouldCreateCounterBid && counterBidUserId && counterBidAmount) {
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

      await tx.product.update({
        where: { id: productId },
        data: {
          currentPrice: finalPrice,
          winnerId: finalWinnerId,
        },
      });

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
            ? `Auto-bidding activated! You are winning with a price of ${finalPrice.toLocaleString('en-US')} VND. The system will automatically increase your bid if someone else bids (maximum: ${maxAmount.toLocaleString('en-US')} VND)`
            : `Bid placed successfully at ${amount.toLocaleString('en-US')} VND. You are leading!`
          : `Your bid of ${newBid.amount.toLocaleString('en-US')} VND was outbid by automatic bidding. Current price: ${finalPrice.toLocaleString('en-US')} VND`,
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

    const isSeller = product?.sellerId === requestingUserId;
    return bids.map((bid) => {
      const shouldMask = !isSeller && bid.userId !== requestingUserId;
      const isOwnBid = bid.userId === requestingUserId;

      return {
        id: bid.id,
        amount: bid.amount.toString(),
        maxAmount: isOwnBid ? bid.maxAmount?.toString() : undefined,
        isProxy: bid.isProxy,
        createdAt: bid.createdAt,
        rejected: bid.rejected,
        user: {
          id: bid.user.id,
          fullName: shouldMask ? maskFullName(bid.user.fullName) : bid.user.fullName,
        },
        bidType: bid.isProxy ? 'auto' : 'manual',
      };
    });
  }

  async getMyCurrentBid(productId: string, userId: string) {
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
      status = 'outbid';
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
}
