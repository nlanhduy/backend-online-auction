import {Injectable} from '@nestjs/common';
import * as paypal from '@paypal/checkout-server-sdk';
import {ConfigService} from '@nestjs/config';
@Injectable()
export class PaypalService{
    private client: paypal.core.PayPalHttpClient;
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
            applied_context:{
                brand_name:'Online Auction',
                landing_page:'BILLING',
                user_action:'PAY_NOW',
                return_url: this.configService.get<string>('PAYPAL_RETURN_URL') || 'http://localhost:3000/payment/success',
                cancel_url: this.configService.get<string>('PAYPAL_CANCEL_URL') || 'http://localhost:3000/payment/cancel',
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
}