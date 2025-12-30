import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/currentUser.decorator';
import { SubmitShippingDto } from './dto/submit-shipping.dto';
import { ConfirmShipmentDto } from './dto/confirm-shipment.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { RateOrderDto } from './dto/rate-order.dto';
import { PaypalService } from '../payment/paypal.service';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paypalService: PaypalService,
  ) {}

  @Get(':orderId')
  @ApiOperation({ 
    summary: 'Get order details',
    description: 'Get order fulfillment details. Only buyer or seller can access.'
  })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order details',
    schema: {
      example: {
        id: 'order-uuid',
        status: 'SHIPPING_INFO_PENDING',
        product: { name: 'iPhone 15', currentPrice: 27500000 },
        buyer: { fullName: 'Nguyen Van A' },
        seller: { fullName: 'Tran Thi B' },
        paymentStatus: 'COMPLETED',
        paidAt: '2025-12-30T10:00:00Z'
      }
    }
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Not buyer or seller' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.getOrderById(orderId, user.id);
  }

  @Get('product/:productId')
  @ApiOperation({ 
    summary: 'Get order by product ID',
    description: 'Get order fulfillment by product. Used when accessing product details after auction ends.'
  })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Order details' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not buyer or seller' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderByProduct(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.ordersService.getOrderByProductId(productId, user.id);
  }

  @Post(':orderId/shipping')
  @ApiOperation({ 
    summary: 'Step 2: Buyer submits shipping address',
    description: 'Buyer provides shipping information after payment completed.'
  })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Shipping address submitted',
    schema: {
      example: {
        id: 'order-uuid',
        status: 'SELLER_CONFIRMATION_PENDING',
        shippingAddress: '123 Nguyen Van Linh',
        shippingSubmittedAt: '2025-12-30T11:00:00Z'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid order status' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only buyer can submit' })
  async submitShipping(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
    @Body() dto: SubmitShippingDto,
  ) {
    return this.ordersService.submitShippingAddress(orderId, user.id, dto);
  }

  @Post(':orderId/confirm-shipment')
  @ApiOperation({ 
    summary: 'Step 3: Seller confirms payment received and provides tracking',
    description: 'Seller confirms order and provides tracking number for shipment.'
  })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Shipment confirmed',
    schema: {
      example: {
        id: 'order-uuid',
        status: 'IN_TRANSIT',
        trackingNumber: 'VN123456789',
        shippingCarrier: 'Giao Hang Nhanh',
        sellerConfirmedAt: '2025-12-30T12:00:00Z'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid order status' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only seller can confirm' })
  async confirmShipment(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
    @Body() dto: ConfirmShipmentDto,
  ) {
    return this.ordersService.confirmShipment(orderId, user.id, dto);
  }

  @Post(':orderId/confirm-received')
  @ApiOperation({ 
    summary: 'Step 4: Buyer confirms goods received',
    description: 'Buyer confirms they have received the goods. Order status becomes COMPLETED. Automatically triggers payout to seller.'
  })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order completed and payout initiated',
    schema: {
      example: {
        id: 'order-uuid',
        status: 'COMPLETED',
        buyerConfirmedAt: '2025-12-31T10:00:00Z',
        receivedAt: '2025-12-31T10:00:00Z',
        payoutStatus: 'COMPLETED',
        sellerAmount: 1090.54,
        platformFee: 57.29
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid order status' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only buyer can confirm' })
  async confirmReceived(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
  ) {
    // Step 1: Buyer confirms received
    const order = await this.ordersService.confirmReceived(orderId, user.id);

    // Step 2: Trigger payout to seller (async - không block response)
    // Chạy trong background, nếu fail sẽ retry sau
    this.ordersService.processPayoutToSeller(orderId, this.paypalService)
      .catch(error => {
        console.error(`Payout failed for order ${orderId}:`, error.message);
        // TODO: Có thể thêm retry mechanism hoặc notification cho admin
      });

    return order;
  }

  @Post(':orderId/cancel')
  @ApiOperation({ 
    summary: 'Cancel order',
    description: 'Seller cancels order and automatically gives -1 rating to buyer. Can cancel at any time before completion.'
  })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Order cancelled',
    schema: {
      example: {
        id: 'order-uuid',
        status: 'CANCELLED',
        isCancelled: true,
        cancelledBy: 'seller-uuid',
        cancellationReason: 'Buyer did not pay within 24 hours',
        cancelledAt: '2025-12-30T15:00:00Z'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Cannot cancel completed order' })
  @ApiResponse({ status: 403, description: 'Forbidden - Only seller can cancel' })
  async cancelOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(orderId, user.id, dto);
  }

  @Post(':orderId/rate')
  @ApiOperation({ 
    summary: 'Rate order',
    description: 'Buyer or seller rates the other party. Value: 1 (positive) or -1 (negative). Can update rating anytime.'
  })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Rating created/updated',
    schema: {
      example: {
        id: 'rating-uuid',
        giverId: 'user-uuid',
        receiverId: 'other-user-uuid',
        value: 1,
        comment: 'Great buyer, fast payment!',
        orderId: 'order-uuid',
        createdAt: '2025-12-31T12:00:00Z',
        updatedAt: '2025-12-31T12:00:00Z'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Cannot rate cancelled order' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not buyer or seller' })
  async rateOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
    @Body() dto: RateOrderDto,
  ) {
    return this.ordersService.rateOrder(orderId, user.id, dto);
  }

  @Get('buyer/my-purchases')
  @ApiOperation({ 
    summary: 'Get buyer orders',
    description: 'Get all orders where current user is the buyer.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'List of buyer orders',
    schema: {
      example: [{
        id: 'order-uuid',
        status: 'COMPLETED',
        product: { name: 'iPhone 15', currentPrice: 27500000 },
        seller: { fullName: 'Tran Thi B' },
        paidAt: '2025-12-30T10:00:00Z'
      }]
    }
  })
  async getMyPurchases(@CurrentUser() user: any) {
    return this.ordersService.getBuyerOrders(user.id);
  }

  @Get('seller/my-sales')
  @ApiOperation({ 
    summary: 'Get seller orders',
    description: 'Get all orders where current user is the seller.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'List of seller orders',
    schema: {
      example: [{
        id: 'order-uuid',
        status: 'IN_TRANSIT',
        product: { name: 'iPhone 15', currentPrice: 27500000 },
        buyer: { fullName: 'Nguyen Van A' },
        trackingNumber: 'VN123456789'
      }]
    }
  })
  async getMySales(@CurrentUser() user: any) {
    return this.ordersService.getSellerOrders(user.id);
  }
}
