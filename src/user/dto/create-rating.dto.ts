import { ApiProperty } from "@nestjs/swagger";
import {IsIn, IsNotEmpty, IsOptional, IsString, IsUUID} from 'class-validator';
// For rate seller
export class CreateRatingDto{
    @ApiProperty({description:'User ID to rate(seller)', example:'uuid'})
    @IsUUID()
    @IsNotEmpty()
    receiverId: string;

    @ApiProperty({description:'Rating value: 1 for positive, -1 for negative', example:1})
    @IsIn([1,-1])
    value: number;
    @ApiProperty({description:'Comment about the seller', required:false})
    @IsOptional()
    @IsString()
    comment?: string;

}