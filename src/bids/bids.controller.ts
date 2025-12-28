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

@ApiTags('Bids')
@Controller('bids')
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
  @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard) // Uncomment và thêm guard khi đã có auth
  async validateBid(
    @Param('productId') productId: string,
    @Request() req: any,
  ): Promise<ValidateBidResponseDto> {
    // Lấy userId từ req.user.id sau khi implement auth guard
    const userId = req.user?.id || 'mock-user-id'; // TODO: Thay bằng real user ID
    return await this.bidsService.validateBid(productId, userId);
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
  @ApiBearerAuth()
  // @UseGuards(JwtAuthGuard) // Uncomment và thêm guard khi đã có auth
  async placeBid(
    @Body() placeBidDto: PlaceBidDto,
    @Request() req: any,
  ): Promise<BidResponseDto> {
    // Lấy userId từ req.user.id sau khi implement auth guard
    const userId = req.user?.id || 'mock-user-id'; // TODO: Thay bằng real user ID
    return await this.bidsService.placeBid(placeBidDto, userId);
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
    @Request() req: any,
  ): Promise<BidHistoryItemDto[]> {
    const userId=req.user?.id || null; // Take userId if available
    return await this.bidsService.getBidHistory(productId, userId);
  }
}
