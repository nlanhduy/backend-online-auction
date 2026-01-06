import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNotEmpty, IsNumber, IsString, Min, IsBoolean, IsOptional, IsPostalCode, IsPositive } from "class-validator";

export class PlaceBidDto{
    @ApiProperty({ example: 'product-123', description: 'The ID of the product to place a bid on' })
    @IsString()
    @IsNotEmpty({message: 'Product ID must not be empty'})
    productId: string;

    @ApiProperty({ minimum:1000, example: 15000000, description: 'The amount of the bid' })
    @IsNumber()
    @Min(1000, {message: 'Bid amount must be at least 1000'})
    @Type(() => Number)
    amount: number;

    @ApiProperty({ 
        description: 'User confirmation before placing bid',
        example: true,
        default: false
    })
    @IsBoolean()
    @IsOptional()
    confirmed?: boolean;

    @ApiProperty({ 
        description: 'Maximum amount willing to pay for auto-bidding',
        example: 20000000,
        required: false
    })
    @IsOptional()
    @IsNumber()
    @IsPositive()
    maxAmount?:number;

    @ApiProperty({ 
        description: 'Deprecated: Backend automatically determines this from maxAmount. This field is ignored.',
        example: true,
        required: false
    })
    @IsOptional()
    @IsBoolean()
    isProxy?: boolean;
}