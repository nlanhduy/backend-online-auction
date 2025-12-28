import { 
  Injectable, 
  BadRequestException, 
  ForbiddenException,
  NotFoundException 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RatingsService } from './ratings.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { ValidateBidResponseDto } from './dto/validate-bid.dto';
import { BidResponseDto } from './dto/bid-response.dto';
import { maskFullName } from 'src/common/utils/mask-name.util';
@Injectable()
export class BidsService {
  constructor(
    private prisma: PrismaService,
    private ratingsService: RatingsService,
  ) {}

  // Validate if user can bid on a product
  // return user if valid
  async validateBid(
    productId: string, 
    userId: string
  ): Promise<ValidateBidResponseDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        bids: {
          orderBy: { amount: 'desc' },
          take: 1,
        },
      },
    });

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
        message: 'Bạn không thể đấu giá sản phẩm của chính mình',
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
      };
    }

    // Check if user can bid
    const canBid = await this.ratingsService.canUserBid(
      userId, 
      product.allowNewBidders
    );
    const { score, total } = await this.ratingsService.getUserRatingScore(userId);

    // Tính giá đề xuất (giá hiện tại + bước giá)
    const suggestedAmount = product.currentPrice + product.priceStep;

    let message = '';
    if (!canBid) {
      if (total === 0) {
        message = 'Bạn chưa có đánh giá nào. Người bán không cho phép bidder mới tham gia đấu giá sản phẩm này.';
      } else {
        message = `Điểm đánh giá của bạn là ${score.toFixed(1)}% (${total} đánh giá). Bạn cần có điểm đánh giá ≥ 80% để tham gia đấu giá.`;
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
    };
  }

  
  async placeBid(
    placeBidDto: PlaceBidDto, 
    userId: string
  ): Promise<BidResponseDto> {
    const { productId, amount, confirmed } = placeBidDto;

    // Validate bid
    const validation = await this.validateBid(productId, userId);

    if (!validation.canBid) {
      throw new ForbiddenException(validation.message);
    }

    // Check confirmation
    if (!confirmed) {
      throw new BadRequestException(
        'Please confirm before placing a bid'
      );
    }

    // Check bid amount
    if (amount < validation.suggestedAmount) {
      throw new BadRequestException(
        `Bid amount must be ≥ ${validation.suggestedAmount.toLocaleString('vi-VN')} VND (current price + step price)`
      );
    }

    // Create new bid and update currentPrice
    const [bid, updatedProduct] = await this.prisma.$transaction([
      this.prisma.bid.create({
        data: {
          amount,
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
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.product.update({
        where: { id: productId },
        data: {
          currentPrice: amount,
        },
      }),
    ]);

    return {
      id: bid.id,
      amount: bid.amount.toString(),
      productId: bid.productId,
      userId: bid.userId,
      userName: bid.user.fullName,
      createdAt: bid.createdAt.toISOString(),
      message: `Successfully placed a bid of ${amount.toLocaleString('vi-VN')} VND for the product "${bid.product.name}"`,
    };
  }

  
  async getBidHistory(productId: string, requestingUserId?: string) {
    const product = await this.prisma.product.findUnique({
        where:{id: productId},
        select:{sellerId: true}
    })

    const bids=await this.prisma.bid.findMany({
        where:{productId},
        include:{
            user:{
                select:{
                    id:true, 
                    fullName: true,
                    role: true,
                },
            },
        
        },
        orderBy:{
            createdAt: 'desc',
        }

    })

    // Check if user is seller or admin
    const isSeller=product?.sellerId===requestingUserId;
    return bids.map(bid=>{
        const shouldMask=!isSeller;
        return {
            id: bid.id,
            amount: bid.amount.toString(),
            createdAt: bid.createdAt,
            rejected: bid.rejected,
            user:{
                id: bid.user.id,
                fullName: shouldMask?maskFullName(bid.user.fullName):bid.user.fullName,
            }
        }
    })
  }
} // Added business logic: seller and admin can see fullName



