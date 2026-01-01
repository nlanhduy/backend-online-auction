import {Injectable} from '@nestjs/common';
import * as paypal from '@paypal/checkout-server-sdk';
import {ConfigService} from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PaypalService{
    private client: paypal.core.PayPalHttpClient;
    private paypalApiUrl: string;
    
    constructor(private configService: ConfigService){
        const clientId=this.configService.get<string>('PAYPAL_CLIENT_ID');
        const clientSecret=this.configService.get<string>('PAYPAL_CLIENT_SECRET');
        const mode=this.configService.get<string>('PAYPAL_MODE')||'sandbox';
        if (!clientId || !clientSecret) {
        throw new Error('PayPal credentials are missing in .env file');
        }

        const environment =
        mode === 'live'
            ? new paypal.core.LiveEnvironment(clientId, clientSecret)
            : new paypal.core.SandboxEnvironment(clientId, clientSecret);

        this.client = new paypal.core.PayPalHttpClient(environment);
        this.paypalApiUrl = mode === 'live' 
            ? 'https://api.paypal.com' 
            : 'https://api.sandbox.paypal.com';
    }

    async createOrder(amount: number, currency: string='USD', description:string='Auction Payment')
    {
        const request=new paypal.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units:[
                {
                    description: description,
                    amount:{
                        currency_code: currency,
                        value: amount.toFixed(2),
                    }
                }
            ],
            application_context:{
                brand_name:'Online Auction',
                landing_page:'BILLING',
                user_action:'PAY_NOW',
                return_url: process.env.PAYPAL_RETURN_URL || this.configService.get<string>('PAYPAL_RETURN_URL') || 'http://localhost:5173/payment/success',
                cancel_url: process.env.PAYPAL_CANCEL_URL || this.configService.get<string>('PAYPAL_CANCEL_URL') || 'http://localhost:5173/payment/cancel',
                shipping_preference: 'NO_SHIPPING',
                payment_method: {
                    payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
                }
            }
        })

        try{
            const response=await this.client.execute(request);
            return{
                id: response.result.id,
                status: response.result.status,
                links: response.result.links,
            }
        }
        catch (error){
            console.error('Error creating PayPal order:', error);
            throw new Error(`Failed to create PayPal order: ${error.message}`);
        }
    }

    async captureOrder(orderId: string){
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});

        try{
            const response = await this.client.execute(request);
            return {
                id: response.result.id,
                status: response.result.status,
                payer: response.result.payer,

                purchase_units: response.result.purchase_units,
            };

        }
        catch (error){
            console.error('PayPal capture error:', error);
            throw new Error(`Failed to capture payment: ${error.message}`);

        }
    }

    async getOrderDetails(orderId: string) {
        const request = new paypal.orders.OrdersGetRequest(orderId);

        try {
        const response = await this.client.execute(request);
        return response.result;
        } catch (error) {
        console.error('PayPal get order error:', error);
        throw new Error(`Failed to get order details: ${error.message}`);
        }
    }

    async refundPayment(
        captureId: string,
        amount?: number,
        currency: string = 'USD',
    ) {
        const request = new paypal.payments.CapturesRefundRequest(captureId);

        if (amount) {
        request.requestBody({
            amount: {
            value: amount.toFixed(2),
            currency_code: currency,
            },
        });
        }

        try {
        const response = await this.client.execute(request);
        return response.result;
        } catch (error) {
        console.error('PayPal refund error:', error);
        throw new Error(`Failed to refund payment: ${error.message}`);
        }
    }

    /**
     * Get OAuth access token for Payouts API
     */
    private async getAccessToken(): Promise<string> {
        const clientId = this.configService.get<string>('PAYPAL_CLIENT_ID');
        const clientSecret = this.configService.get<string>('PAYPAL_CLIENT_SECRET');
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        try {
            const response = await axios.post(
                `${this.paypalApiUrl}/v1/oauth2/token`,
                'grant_type=client_credentials',
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );
            return response.data.access_token;
        } catch (error) {
            console.error('PayPal OAuth error:', error);
            throw new Error('Failed to get PayPal access token');
        }
    }

    /**
     * PayPal Payouts API - Chuyển tiền cho seller
     * @param sellerEmail Email PayPal của seller
     * @param amount Số tiền (USD)
     * @param orderId Order ID để tracking
     */
    async payoutToSeller(sellerEmail: string, amount: number, orderId: string) {
        const accessToken = await this.getAccessToken();

        const payoutData = {
            sender_batch_header: {
                sender_batch_id: `order_${orderId}_${Date.now()}`, // Unique batch ID
                email_subject: 'You have received a payout from Online Auction',
                email_message: 'You have received a payout! Thank you for selling on our platform.',
            },
            items: [
                {
                    recipient_type: 'EMAIL',
                    amount: {
                        value: amount.toFixed(2),
                        currency: 'USD',
                    },
                    receiver: sellerEmail,
                    note: `Payout for order: ${orderId}`,
                    sender_item_id: orderId, // Link to order
                },
            ],
        };

        try {
            const response = await axios.post(
                `${this.paypalApiUrl}/v1/payments/payouts`,
                payoutData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            return {
                batchId: response.data.batch_header.payout_batch_id,
                batchStatus: response.data.batch_header.batch_status, // PENDING/SUCCESS
                itemId: response.data.links?.[0]?.href, // Link to check status
            };
        } catch (error) {
            console.error('PayPal Payout error:', error.response?.data || error);
            throw new Error(`Failed to payout to seller: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Kiểm tra trạng thái payout
     */
    async getPayoutStatus(batchId: string) {
        const accessToken = await this.getAccessToken();

        try {
            const response = await axios.get(
                `${this.paypalApiUrl}/v1/payments/payouts/${batchId}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            return {
                batchStatus: response.data.batch_header.batch_status,
                items: response.data.items,
            };
        } catch (error) {
            console.error('PayPal get payout status error:', error);
            throw new Error('Failed to get payout status');
        }
    }
}