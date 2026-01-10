import { ApiProperty } from '@nestjs/swagger';

export class ValidateBidResponseDto {
  @ApiProperty({ description: 'Whether the user can place a bid on this product' })
  canBid: boolean;

  @ApiProperty({ description: 'Suggested minimum bid amount (current price + step price)' })
  suggestedAmount: number;

  @ApiProperty({ description: 'Current highest price of the product' })
  currentPrice: number;

  @ApiProperty({ description: 'Price step set by seller' })
  stepPrice: number;

  @ApiProperty({
    description: 'User rating score percentage (positive ratings / total ratings * 100)',
    example: 80.5,
  })
  userRatingScore: number;

  @ApiProperty({
    description: 'Total number of ratings received by user',
    example: 10,
  })
  userTotalRatings: number;

  @ApiProperty({
    description: 'Message explaining why user cannot bid (if canBid is false)',
    required: false,
  })
  message?: string;

  //isSeller
  @ApiProperty({ description: 'Whether the user is a seller' })
  isSeller: boolean;

  //isBidding
  @ApiProperty({ description: 'Whether the user is currently bidding on the product' })
  isBidding: boolean;
}
