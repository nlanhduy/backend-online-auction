import { PrismaService } from "src/prisma/prisma.service";
import { PaypalService } from "./paypal.service";
import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from "@nestjs/swagger";
import { CurrentUser } from "src/common/decorators/currentUser.decorator";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";


@ApiTags('payment')
@Controller('payment')
@ApiBearerAuth('access-token')
export class PaymentController{
    constructor(private readonly paymentService: PaypalService, private readonly prisma: PrismaService){}
    @Post('create-order')
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

        if (!product.winnerId || product.winnerId !== user.id) {
            throw new BadRequestException('You are not the winner of this auction');
        }

            // Chuyển VND sang USD (1 USD = 24,000 VND)
        const exchangeRate = 24000;
        const amountInUSD = product.currentPrice / exchangeRate;

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
        amountVND: product.currentPrice,
        productName: product.name,
        };
    }

    @Post('capture-order/:orderId')
    @ApiOperation({ 
        summary: 'Capture PayPal payment',
        description: 'Capture payment after user approves on PayPal. Call this API after user returns from PayPal.'
    })
    @ApiParam({ name: 'orderId', description: 'PayPal Order ID', example: '7XX12345ABCD...' })
    @ApiResponse({ 
        status: 200, 
        description: 'Payment completed successfully',
        schema: {
            example: {
                success: true,
                message: 'Payment completed successfully',
                transactionId: '8YY98765WXYZ...',
                payerEmail: 'buyer@example.com',
                status: 'COMPLETED'
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Capture payment failed' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async captureOrder(@CurrentUser() user:any, @Param('orderId') orderId: string){
        try {
            const result=await this.paymentService.captureOrder(orderId);
            if (result.status === 'COMPLETED') {
                return {
                    success: true,
                    message: 'Payment completed successfully',
                    transactionId: result.id,
                    payerEmail: result.payer.email_address,
                    status: result.status,
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