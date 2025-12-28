import { ApiProperty } from "@nestjs/swagger";

export class BidResponseDto{
    @ApiProperty()
    id: string;
    @ApiProperty()
    amount: string;
    @ApiProperty()
    productId: string;
    @ApiProperty()
    userId: string;
    @ApiProperty()
    userName: string;
    @ApiProperty()
    createdAt: string;
    @ApiProperty()
    message: string;
}

export class BidHistoryItemDto{
    @ApiProperty()
    id: string;
    @ApiProperty()
    amount: string;
    @ApiProperty()
    createdAt: Date;
    @ApiProperty()
    rejected: boolean;
    @ApiProperty({
        description: 'User information with masked name for privacy (e.g., ****Khoa)', 
        example: { id: 'uuid', fullName: '****Khoa' }
    })
    user: {
        id: string;
        fullName: string; // Sẽ là masked name như "****Khoa"
    }
}