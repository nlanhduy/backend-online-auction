import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus, PayoutStatus } from '@prisma/client';
import { SubmitShippingDto } from './dto/submit-shipping.dto';
import { ConfirmShipmentDto } from './dto/confirm-shipment.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { RateOrderDto } from './dto/rate-order.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get order by ID with authorization check
   */
  async getOrderById(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: {
          include: {
            seller: { select: { id: true, fullName: true, email: true, avatar: true } },
          },
        },
        buyer: { select: { id: true, fullName: true, email: true, avatar: true } },
        seller: { select: { id: true, fullName: true, email: true, avatar: true } },
        buyerRating: true,
        sellerRating: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Only buyer or seller can view
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('You do not have permission to view this order');
    }

    return order;
  }

  /**
   * Get order by product ID
   */
  async getOrderByProductId(productId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { productId },
      include: {
        product: true,
        buyer: { select: { id: true, fullName: true, email: true, avatar: true } },
        seller: { select: { id: true, fullName: true, email: true, avatar: true } },
        buyerRating: true,
        sellerRating: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found for this product');
    }

    // Only buyer or seller can view
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('You do not have permission to view this order');
    }

    return order;
  }

  /**
   * Create order after payment (called from payment service)
   */
  async createOrderAfterPayment(
    productId: string,
    paypalOrderId: string,
    transactionId: string,
    amount: number,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        seller: { select: { id: true, paypalEmail: true } },
      },
    });

    if (!product || !product.winnerId) {
      throw new BadRequestException('Product not found or no winner');
    }

    // Tính platform fee (5%) và seller amount
    const PLATFORM_FEE_PERCENT = 0.05; // 5%
    const platformFee = amount * PLATFORM_FEE_PERCENT;
    const sellerAmount = amount - platformFee;

    // Check if order already exists
    const existingOrder = await this.prisma.order.findUnique({
      where: { productId },
    });

    if (existingOrder) {
      // Update existing order
      return this.prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          paymentStatus: PaymentStatus.COMPLETED,
          paypalOrderId,
          paypalTransactionId: transactionId,
          paymentAmount: amount,
          platformFee,
          sellerAmount,
          sellerPaypalEmail: product.seller.paypalEmail,
          paidAt: new Date(),
          status: OrderStatus.SHIPPING_INFO_PENDING,
        },
      });
    }

    // Create new order
    return this.prisma.order.create({
      data: {
        productId,
        buyerId: product.winnerId,
        sellerId: product.sellerId,
        paymentStatus: PaymentStatus.COMPLETED,
        paypalOrderId,
        paypalTransactionId: transactionId,
        paymentAmount: amount,
        platformFee,
        sellerAmount,
        sellerPaypalEmail: product.seller.paypalEmail,
        paidAt: new Date(),
        status: OrderStatus.SHIPPING_INFO_PENDING,
        payoutStatus: PayoutStatus.PENDING, // Chưa chuyển tiền cho seller
      },
    });
  }

  /**
   * Step 2: Buyer submits shipping address
   */
  async submitShippingAddress(orderId: string, userId: string, dto: SubmitShippingDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only buyer can submit shipping address');
    }

    if (order.status !== OrderStatus.SHIPPING_INFO_PENDING) {
      throw new BadRequestException('Cannot submit shipping address at this stage');
    }

    if (order.isCancelled) {
      throw new BadRequestException('Order has been cancelled');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        shippingAddress: dto.address,
        shippingCity: dto.city,
        shippingDistrict: dto.district,
        shippingPhone: dto.phone,
        shippingNote: dto.note,
        shippingSubmittedAt: new Date(),
        status: OrderStatus.SELLER_CONFIRMATION_PENDING,
      },
    });
  }

  /**
   * Step 3: Seller confirms payment received and provides tracking
   */
  async confirmShipment(orderId: string, userId: string, dto: ConfirmShipmentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.sellerId !== userId) {
      throw new ForbiddenException('Only seller can confirm shipment');
    }

    if (order.status !== OrderStatus.SELLER_CONFIRMATION_PENDING) {
      throw new BadRequestException('Cannot confirm shipment at this stage');
    }

    if (order.isCancelled) {
      throw new BadRequestException('Order has been cancelled');
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        sellerConfirmedAt: new Date(),
        trackingNumber: dto.trackingNumber,
        shippingCarrier: dto.carrier,
        shippedAt: new Date(),
        status: OrderStatus.IN_TRANSIT,
      },
    });
  }

  /**
   * Step 4: Buyer confirms received
   * QUAN TRỌNG: Sau khi buyer confirm → trigger payout cho seller
   */
  async confirmReceived(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only buyer can confirm received');
    }

    if (order.status !== OrderStatus.IN_TRANSIT && order.status !== OrderStatus.BUYER_CONFIRMATION_PENDING) {
      throw new BadRequestException('Cannot confirm received at this stage');
    }

    if (order.isCancelled) {
      throw new BadRequestException('Order has been cancelled');
    }

    // Update order status to COMPLETED
    // Payout sẽ được trigger bởi OrdersController sau khi update thành công
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        buyerConfirmedAt: new Date(),
        receivedAt: new Date(),
        status: OrderStatus.COMPLETED,
        payoutStatus: PayoutStatus.PROCESSING, // Đánh dấu đang xử lý payout
      },
    });
  }

  /**
   * Process payout to seller (called after buyer confirms received)
   */
  async processPayoutToSeller(orderId: string, paypalService: any) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.payoutStatus !== PayoutStatus.PROCESSING) {
      throw new BadRequestException('Order is not ready for payout');
    }

    if (!order.sellerPaypalEmail) {
      // Nếu seller chưa có PayPal email, đánh dấu failed
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          payoutStatus: PayoutStatus.FAILED,
        },
      });
      throw new BadRequestException('Seller has not provided PayPal email');
    }

    try {
      // Gọi PayPal Payouts API
      const payoutResult = await paypalService.payoutToSeller(
        order.sellerPaypalEmail,
        order.sellerAmount,
        orderId,
      );

      // Update order với payout info
      return await this.prisma.order.update({
        where: { id: orderId },
        data: {
          payoutStatus: PayoutStatus.COMPLETED,
          payoutBatchId: payoutResult.batchId,
          payoutItemId: payoutResult.itemId,
          paidToSellerAt: new Date(),
        },
      });
    } catch (error) {
      // Nếu payout fail, đánh dấu FAILED
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          payoutStatus: PayoutStatus.FAILED,
        },
      });
      throw new BadRequestException(`Payout failed: ${error.message}`);
    }
  }

  /**
   * Cancel order (Seller only)
   */
  async cancelOrder(orderId: string, userId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { buyer: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.sellerId !== userId) {
      throw new ForbiddenException('Only seller can cancel order');
    }

    if (order.isCancelled) {
      throw new BadRequestException('Order already cancelled');
    }

    if (order.status === OrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed order');
    }

    // Cancel order and create negative rating for buyer
    const [updatedOrder, rating] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          isCancelled: true,
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancellationReason: dto.reason,
          status: OrderStatus.CANCELLED,
        },
      }),
      this.prisma.rating.create({
        data: {
          giverId: userId,
          receiverId: order.buyerId,
          value: -1,
          comment: `Order cancelled: ${dto.reason}`,
          orderId: orderId,
        },
      }),
    ]);

    // Update buyer negative rating
    await this.prisma.user.update({
      where: { id: order.buyerId },
      data: {
        negativeRating: { increment: 1 },
      },
    });

    return updatedOrder;
  }

  /**
   * Rate order (Buyer or Seller)
   */
  async rateOrder(orderId: string, userId: string, dto: RateOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyerRating: true,
        sellerRating: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const isBuyer = order.buyerId === userId;
    const isSeller = order.sellerId === userId;

    if (!isBuyer && !isSeller) {
      throw new ForbiddenException('Only buyer or seller can rate');
    }

    if (order.isCancelled) {
      throw new BadRequestException('Cannot rate cancelled order');
    }

    // Determine who is rating whom
    const giverId = userId;
    const receiverId = isBuyer ? order.sellerId : order.buyerId;
    const existingRating = isBuyer ? order.buyerRating : order.sellerRating;

    let rating;

    if (existingRating) {
      // Update existing rating
      const oldValue = existingRating.value;
      
      rating = await this.prisma.rating.update({
        where: { id: existingRating.id },
        data: {
          value: dto.value,
          comment: dto.comment,
        },
      });

      // Update receiver's rating count
      if (oldValue !== dto.value) {
        const incrementPositive = dto.value === 1 ? 1 : (oldValue === 1 ? -1 : 0);
        const incrementNegative = dto.value === -1 ? 1 : (oldValue === -1 ? -1 : 0);

        await this.prisma.user.update({
          where: { id: receiverId },
          data: {
            positiveRating: { increment: incrementPositive },
            negativeRating: { increment: incrementNegative },
          },
        });
      }
    } else {
      // Create new rating
      rating = await this.prisma.rating.create({
        data: {
          giverId,
          receiverId,
          value: dto.value,
          comment: dto.comment,
          orderId,
        },
      });

      // Link rating to order
      await this.prisma.order.update({
        where: { id: orderId },
        data: isBuyer
          ? { buyerRatingId: rating.id }
          : { sellerRatingId: rating.id },
      });

      // Update receiver's rating count
      await this.prisma.user.update({
        where: { id: receiverId },
        data: dto.value === 1
          ? { positiveRating: { increment: 1 } }
          : { negativeRating: { increment: 1 } },
      });
    }

    return rating;
  }

  /**
   * Get buyer's purchases
   */
  async getBuyerOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { buyerId: userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            mainImage: true,
            currentPrice: true,
          },
        },
        seller: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
          },
        },
        buyerRating: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get seller's sales
   */
  async getSellerOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { sellerId: userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            mainImage: true,
            currentPrice: true,
          },
        },
        buyer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
          },
        },
        sellerRating: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}