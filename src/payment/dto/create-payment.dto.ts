import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreatePaymentDto{
    @ApiProperty({ 
        description: 'Product ID to purchase',
        example: 'prod-123'
    })
    @IsString()
    @IsNotEmpty()
    productId: string;

    @ApiProperty({ 
        description: 'True if using Buy Now feature, false for auction win payment',
        example: true,
        required: false,
        default: false
    })
    @IsBoolean()
    @IsOptional()
    isBuyNow?: boolean;
}

export class CapturePaymentDto{
    @IsString()
    @IsNotEmpty()
    orderId: string;
}