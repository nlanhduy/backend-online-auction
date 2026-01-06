import { PrismaService } from "src/prisma/prisma.service";
import { PaypalService } from "./paypal.service";
import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from "@nestjs/swagger";
import { CurrentUser } from "src/common/decorators/currentUser.decorator";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { OrdersService } from "../orders/orders.service";


@ApiTags('payment')
@Controller('payment')
@ApiBearerAuth('access-token')
export class PaymentController{
    constructor(
        private readonly paymentService: PaypalService,
        private readonly prisma: PrismaService,
        private readonly ordersService: OrdersService,
    ){}
    @Post('create-order')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ 
        summary: 'Create PayPal payment order',
        description: 'Create PayPal order for won auction product. Returns approval URL to redirect user to PayPal for payment.'
    })
    @ApiBody({ type: CreatePaymentDto })
    @ApiResponse({ 
        status: 200, 
        description: 'Order created successfully',
        schema: {
            example: {
                success: true,
                orderId: '7XX12345ABCD...',
                approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=...',
                amount: 1145.83,
                amountVND: 27500000,
                productName: 'iPhone 15 Pro Max 512GB'
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Product not found / Not the winner' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async createOrder(@CurrentUser() user: any, @Body() body: CreatePaymentDto){
        const product = await this.prisma.product.findUnique({
            where: { id: body.productId },
            include:{
                bids:{
                    where:{ rejected:false},
                    orderBy:{ amount: 'desc' },
                    take: 1,
                }
            }
        });
        

        if (!product) {
            throw new BadRequestException('Product not found');
        }

        // if (product.status !== 'COMPLETED') {
        //     throw new BadRequestException('Auction is not completed yet');
        // }

        // Determine if this is a Buy Now or Auction Win payment
        const isBuyNow = body.isBuyNow && product.buyNowPrice;
        const finalAmount = isBuyNow ? product.buyNowPrice! : product.currentPrice;

        // For auction (not Buy Now), must be the winner
        if (!isBuyNow && (!product.winnerId || product.winnerId !== user.id)) {
            throw new BadRequestException('You are not the winner of this auction');
        }

        // For Buy Now, product must still be active
        if (isBuyNow && product.status !== 'ACTIVE') {
            throw new BadRequestException('Product is no longer available for Buy Now');
        }

            // Chuyển VND sang USD (1 USD = 24,000 VND)
        const exchangeRate = 24000;
        const amountInUSD = finalAmount / exchangeRate;

        const order = await this.paymentService.createOrder(
        amountInUSD,
        'USD',
        `Payment for: ${product.name}`,
        );

        const approvalUrl = order.links.find((link) => link.rel === 'approve')?.href;

        return {
        success: true,
        orderId: order.id,
        approvalUrl: approvalUrl,
        amount: amountInUSD,
        amountVND: finalAmount,
        productName: product.name,
        isBuyNow: isBuyNow,
        };
    }

    @UseGuards(JwtAuthGuard)
    @Post('capture-order/:orderId/:productId')
    @ApiOperation({ 
        summary: 'Capture PayPal payment',
        description: 'Capture payment after user approves on PayPal. Call this API after user returns from PayPal. Automatically creates Order record after successful payment.'
    })
    @ApiParam({ name: 'orderId', description: 'PayPal Order ID', example: '7XX12345ABCD...' })
    @ApiParam({ name: 'productId', description: 'Product ID' })
    @ApiResponse({ 
        status: 200, 
        description: 'Payment completed successfully',
        schema: {
            example: {
                success: true,
                message: 'Payment completed successfully',
                transactionId: '8YY98765WXYZ...',
                payerEmail: 'buyer@example.com',
                status: 'COMPLETED',
                order: {
                    id: 'order-uuid',
                    status: 'SHIPPING_INFO_PENDING',
                    productId: 'product-uuid'
                }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Capture payment failed' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async captureOrder(
        @CurrentUser() user:any,
        @Param('orderId') orderId: string,
        @Param('productId') productId: string,
    ){
        try {
            const result = await this.paymentService.captureOrder(orderId);
            
            if (result.status === 'COMPLETED') {
                // Lấy thông tin transaction ID và amount
                const transactionId = result.purchase_units?.[0]?.payments?.captures?.[0]?.id || result.id;
                const amount = parseFloat(result.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || '0');

                // Tạo Order sau khi thanh toán thành công
                const order = await this.ordersService.createOrderAfterPayment(
                    productId,
                    orderId,
                    transactionId,
                    amount,
                    user.id, // Pass buyer ID
                );

                return {
                    success: true,
                    message: 'Payment completed successfully',
                    transactionId,
                    payerEmail: result.payer.email_address,
                    status: result.status,
                    order: {
                        id: order.id,
                        status: order.status,
                        productId: order.productId,
                    },
                };
            }
            return {
                success: false,
                message: 'Payment captured successfully',
                status: result.status,
            };
       
        }
        catch (error){
            throw new BadRequestException(
                `Failed to capture payment: ${error.message}`,
            );

        }
        
    }
    
    @Get('success')
    @ApiOperation({ 
        summary: 'PayPal payment success callback',
        description: 'This endpoint is called by PayPal after user approves payment. Shows instructions to complete the payment capture.'
    })
    @ApiResponse({ 
        status: 200, 
        description: 'Payment approved successfully. Returns HTML page with next steps.',
        content: { 'text/html': {} }
    })
    async paymentSuccess(@Query('token') token: string, @Query('PayerID') payerId: string) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Approved - Online Auction</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                    .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 20px; border-radius: 5px; }
                    .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 15px; border-radius: 5px; margin-top: 20px; }
                    .code { background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace; margin: 10px 0; }
                    h1 { color: #155724; }
                    .steps { margin: 20px 0; }
                    .step { margin: 10px 0; padding: 10px; background: #f8f9fa; border-left: 3px solid #28a745; }
                </style>
            </head>
            <body>
                <div class="success">
                    <h1>✅ Payment Approved!</h1>
                    <p>Your payment has been approved on PayPal.</p>
                    <p><strong>Order ID:</strong> <code>${token}</code></p>
                    <p><strong>Payer ID:</strong> <code>${payerId}</code></p>
                </div>
                
                <div class="info">
                    <h2>📋 Next Steps to Complete Payment:</h2>
                    <div class="steps">
                        <div class="step">
                            <strong>Step 1:</strong> Copy your Order ID above
                        </div>
                        <div class="step">
                            <strong>Step 2:</strong> Call the capture API with your access token:
                            <div class="code">
                                POST /payment/capture-order/${token}/{productId}<br>
                                Headers: Authorization: Bearer {your_access_token}
                            </div>
                        </div>
                        <div class="step">
                            <strong>Step 3:</strong> After successful capture, your order will be created automatically
                        </div>
                    </div>
                    
                    <p><strong>⚠️ Important:</strong> The payment is only reserved. You must call the capture API to complete the transaction!</p>
                </div>
            </body>
            </html>
        `;
    }

    @Get('cancel')
    @ApiOperation({ 
        summary: 'PayPal payment cancel callback',
        description: 'This endpoint is called when user cancels payment on PayPal'
    })
    @ApiResponse({ 
        status: 200, 
        description: 'Payment cancelled',
        content: { 'text/html': {} }
    })
    async paymentCancel(@Query('token') token: string) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Cancelled - Online Auction</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                    .warning { background: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 20px; border-radius: 5px; }
                    h1 { color: #856404; }
                    .info { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="warning">
                    <h1>❌ Payment Cancelled</h1>
                    <p>You have cancelled the payment process.</p>
                    <p><strong>Order ID:</strong> <code>${token}</code></p>
                </div>
                
                <div class="info">
                    <p>The payment was not completed. The order will not be processed.</p>
                    <p>If you want to complete the purchase, please create a new payment order.</p>
                </div>
            </body>
            </html>
        `;
    }
    
    @UseGuards(JwtAuthGuard)
    @Get('order/:orderId')
    @ApiOperation({ 
        summary: 'Get PayPal order details',
        description: 'View detailed information of a PayPal order by ID'
    })
    @ApiParam({ name: 'orderId', description: 'PayPal Order ID', example: '7XX12345ABCD...' })
    @ApiResponse({ 
        status: 200, 
        description: 'Order details retrieved successfully',
        schema: {
            example: {
                success: true,
                order: {
                    id: '7XX12345ABCD...',
                    status: 'APPROVED',
                    purchase_units: [],
                    payer: {}
                }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Order not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getOrder(@Param('orderId') orderId: string) {
        try {
            const order = await this.paymentService.getOrderDetails(orderId);
            return {
                success: true,
                order: order,
            };
        } catch (error) {
            throw new BadRequestException(`Failed to get order: ${error.message}`);
        }
    }

    @Post('webhook')
    @ApiOperation({ 
        summary: 'PayPal Webhook Handler',
        description: 'Endpoint to receive notifications from PayPal about payment status (PAYMENT.CAPTURE.COMPLETED, DENIED, REFUNDED, etc.)'
    })
    @ApiResponse({ 
        status: 200, 
        description: 'Webhook received',
        schema: {
            example: { received: true }
        }
    })
    async handleWebhook(@Body() body: any) {
        console.log('PayPal Webhook:', JSON.stringify(body, null, 2));

        switch (body.event_type) {
        case 'PAYMENT.CAPTURE.COMPLETED':
            console.log('Payment captured:', body.resource.id);
            // TODO: Update database
            break;

        case 'PAYMENT.CAPTURE.DENIED':
            console.log('Payment denied:', body.resource.id);
            break;

        case 'PAYMENT.CAPTURE.REFUNDED':
            console.log('Payment refunded:', body.resource.id);
            break;

        default:
            console.log('Unhandled event:', body.event_type);
        }

        return { received: true };
    }

    @UseGuards(JwtAuthGuard)
    @Post('refund/:captureId')
    @ApiOperation({ 
        summary: 'Refund PayPal payment',
        description: 'Refund full or partial amount for a captured payment. If amount is not provided, full refund will be processed.'
    })
    @ApiParam({ name: 'captureId', description: 'PayPal Capture ID (transaction ID)', example: '8YY98765WXYZ...' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                amount: { type: 'number', description: 'Refund amount (USD). Leave empty for full refund', example: 50.00 }
            }
        }
    })
    @ApiResponse({ 
        status: 200, 
        description: 'Refund completed successfully',
        schema: {
            example: {
                success: true,
                refundId: '9ZZ87654REFUND...',
                status: 'COMPLETED',
                amount: { value: '50.00', currency_code: 'USD' }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Refund failed' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async refundPayment(
        @Param('captureId') captureId: string,
        @Body() body: { amount?: number },
    ) {
        try {
            const result = await this.paymentService.refundPayment(
                captureId,
                body.amount,
            );

            return {
                success: true,
                refundId: result.id,
                status: result.status,
                amount: result.amount,
            };
        } catch (error) {
            throw new BadRequestException(`Refund failed: ${error.message}`);
        }
    }


}