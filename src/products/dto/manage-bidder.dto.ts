import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ManageBidderDto {
  @ApiProperty({
    description: 'User ID of the bidder to deny/allow',
    example: 'user-uuid-123',
  })
  @IsString()
  @IsNotEmpty({ message: 'Bidder ID must not be empty' })
  bidderId: string;
}

export class DeniedBiddersResponseDto {
  @ApiProperty({
    description: 'List of denied bidder user IDs',
    example: ['user-id-1', 'user-id-2'],
  })
  deniedBidders: string[];

  @ApiProperty({
    description: 'Details of denied bidders',
    type: 'array',
  })
  bidders: Array<{
    id: string;
    fullName: string;
    email: string;
  }>;
}

export class ActiveBidderDto {
  @ApiProperty({ description: 'Bidder user ID' })
  id: string;

  @ApiProperty({ description: 'Bidder full name' })
  fullName: string;

  @ApiProperty({ description: 'Current highest bid amount' })
  highestBid: number;

  @ApiProperty({ description: 'Total number of bids placed' })
  totalBids: number;

  @ApiProperty({ description: 'Is this bidder currently winning?' })
  isWinning: boolean;

  @ApiProperty({ description: 'Last bid timestamp' })
  lastBidTime: Date;
}

export class ActiveBiddersResponseDto {
  @ApiProperty({ description: 'List of active bidders', type: [ActiveBidderDto] })
  bidders: ActiveBidderDto[];

  @ApiProperty({ description: 'Current winner user ID', nullable: true })
  currentWinnerId: string | null;
}
