import { IsNotEmpty, IsString } from "class-validator";

export class CreatePaymentDto{
    @IsString()
    @IsNotEmpty()
    productId: string;
}

export class CapturePaymentDto{
    @IsString()
    @IsNotEmpty()
    orderId: string;
}