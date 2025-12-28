import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  UseGuards,
  Request,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { BidsService } from './bids.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { BidResponseDto, BidHistoryItemDto } from './dto/bid-response.dto';
import { ValidateBidResponseDto } from './dto/validate-bid.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from 'src/common/decorators/currentUser.decorator';

@ApiTags('Bids')
@Controller('bids')
@ApiBearerAuth('access-token')
@Roles(UserRole.BIDDER)
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @Get('validate/:productId')
  @ApiOperation({ 
    summary: 'Validate if user can bid on a product',
    description: 'Check user rating score and product settings to determine if user can place a bid. Returns suggested bid amount and validation details.'
  })
  @ApiParam({ name: 'productId', description: 'Product ID to validate bid for' })
  @ApiResponse({ 
    status: 200, 
    description: 'Validation result',
    type: ValidateBidResponseDto 
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async validateBid(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ): Promise<ValidateBidResponseDto> {
    return await this.bidsService.validateBid(productId, user.id);
  }

  @Post()
  @ApiOperation({ 
    summary: 'Place a bid on a product',
    description: 'Place a new bid on a product. User must have rating score >= 80% or be allowed by seller if no ratings exist.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Bid placed successfully',
    type: BidResponseDto 
  })
  @ApiResponse({ status: 400, description: 'Invalid bid amount or missing confirmation' })
  @ApiResponse({ status: 403, description: 'User not allowed to bid (low rating or not permitted by seller)' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async placeBid(
    @Body() placeBidDto: PlaceBidDto,
    @CurrentUser() user: any,
  ): Promise<BidResponseDto> {
    return await this.bidsService.placeBid(placeBidDto, user.id);
  }

  @Get('history/:productId')
  @ApiOperation({ 
    summary: 'Get bid history for a product',
    description: 'Retrieve all bids placed on a specific product, ordered by creation time (newest first)'
  })
  @ApiParam({ name: 'productId', description: 'Product ID to get bid history for' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of bids',
    type: [BidHistoryItemDto]
  })
  async getBidHistory(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ): Promise<BidHistoryItemDto[]> {
    const userId = user?.id || null;
    return await this.bidsService.getBidHistory(productId, userId);
  }
}
