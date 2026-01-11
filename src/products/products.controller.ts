/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard';
import { BidsService } from 'src/bids/bids.service';
import { CurrentUser } from 'src/common/decorators/currentUser.decorator';
import { GetUserProductDto } from 'src/user/dto/get-user-product.dto';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Product, UserRole } from '@prisma/client';

import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminUpdateProductDto } from './dto/admin-update-product.dto';
import { CreateProductDto } from './dto/create-product.dto';
import {
  DescriptionHistoryDto,
  DescriptionHistoryResponseDto,
} from './dto/description-history.dto';
import { HomepageResponseDto } from './dto/product-list-items';
import { SearchProductDto } from './dto/search-product.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { UpdateDescriptionHistoryDto } from './dto/update-description-history.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly bidsService: BidsService,
  ) {}

  // ==================== Public Routes ====================

  @Public()
  @Get('search')
  @ApiOperation({
    summary: 'Search products with filters (Public)',
    description:
      'Search products by name, category, price range. Query is optional - can use filters only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Products found successfully',
    type: SearchResponseDto,
  })
  async searchProducts(@Query() searchDto: SearchProductDto): Promise<SearchResponseDto> {
    return this.productsService.searchProducts(searchDto);
  }

  @Public()
  @Get('homepage')
  @ApiOperation({
    summary: 'Get homepage products (Public)',
    description: 'Returns ending soon, most bids, and highest priced products',
  })
  @ApiResponse({ status: 200, description: 'Homepage products retrieved successfully' })
  async getHomePageProducts(): Promise<HomepageResponseDto> {
    return this.productsService.getHomepageProducts();
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  @ApiOperation({
    summary: 'Get product details by ID (Public)',
    description:
      'Smart multi-purpose endpoint that adapts response based on product status and user role:\n\n' +
      'ACTIVE Product (Auction in progress):\n' +
      '  → Returns normal product details for everyone\n\n' +
      'COMPLETED Product (Auction ended):\n' +
      '  → Buyer/Seller (authenticated): Returns full order info including shipping, tracking, payment status. Frontend shows Order Management UI\n' +
      '  → Other users: Returns basic info with "Auction ended" message. Hides sensitive order details\n\n' +
      'Response includes:\n' +
      '  • viewType: "ORDER_FULFILLMENT" | "AUCTION_ENDED" | undefined\n' +
      '  • order: Full order object (only for buyer/seller on completed products)\n\n' +
      'Frontend usage: Check viewType to determine which UI to render (Product Detail vs Order Management vs Ended Message)',
  })
  @ApiResponse({
    status: 200,
    description: 'Product found - Response varies based on status and user role',
    schema: {
      oneOf: [
        {
          description: 'Active product - Normal product details',
          example: {
            id: 'prod-123',
            name: 'iPhone 15 Pro Max',
            currentPrice: 27500000,
            description: { content: 'Brand new...', createdAt: '2025-12-30T10:00:00Z' },
            status: 'ACTIVE',
            seller: { id: 'seller-id', fullName: 'Tran Thi B' },
          },
        },
        {
          description: 'Completed product - Buyer/Seller view with ORDER INFO',
          example: {
            id: 'prod-123',
            name: 'iPhone 15 Pro Max',
            currentPrice: 27500000,
            status: 'COMPLETED',
            viewType: 'ORDER_FULFILLMENT',
            order: {
              id: 'order-uuid',
              status: 'IN_TRANSIT',
              trackingNumber: 'VN123456789',
              shippingAddress: '123 Nguyen Van Linh',
              paymentStatus: 'COMPLETED',
              buyer: { id: 'buyer-id', fullName: 'Nguyen Van A' },
              seller: { id: 'seller-id', fullName: 'Tran Thi B' },
            },
          },
        },
        {
          description: 'Completed product - Other users view (limited info)',
          example: {
            id: 'prod-123',
            name: 'iPhone 15 Pro Max',
            currentPrice: 27500000,
            status: 'COMPLETED',
            viewType: 'AUCTION_ENDED',
            message: 'Sản phẩm đã kết thúc',
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') id: string, @CurrentUser() user?: any) {
    return this.productsService.findOne(id, user?.id);
  }

  @Public()
  @Get(':id/description-history')
  @ApiOperation({
    summary: 'Get description change history of a product (Public)',
    description: 'View all description changes with timestamps and who made them',
  })
  @ApiResponse({
    status: 200,
    description: 'Description history retrieved successfully',
    type: DescriptionHistoryResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Product not found',
  })
  async getDescriptionHistory(@Param('id') id: string): Promise<DescriptionHistoryResponseDto> {
    return await this.productsService.getDescriptionHistory(id);
  }

  @ApiBearerAuth('access-token')
  @Get(':productId/review-permission')
  @ApiOperation({
    summary: 'Check review permission & order fulfillment status',
    description:
      'Multi-purpose endpoint for product post-auction status:\n\n' +
      '1. Rating Permission: Check if user can rate (seller rate winner, winner rate seller)\n' +
      '2. Order Status: Returns order fulfillment status to determine UI redirect\n\n' +
      'Use Cases:\n' +
      '  → Product detail page: Check if should show "Rate" button\n' +
      '  → Navigation: Determine if redirect to Order Fulfillment page needed\n' +
      '  → Order tracking: Get current order status (SHIPPING_INFO_PENDING, IN_TRANSIT, etc.)\n\n' +
      'Response Fields:\n' +
      '  • canRate: Can user submit rating?\n' +
      '  • hasOrder: Is there an order created?\n' +
      '  • orderStatus: Current order status (if exists)\n' +
      '  • needsAction: Does order need user action? (e.g. buyer submit shipping, seller confirm)\n' +
      '  • redirectToOrderPage: Should UI redirect to order fulfillment?',
  })
  @ApiResponse({
    status: 200,
    description: 'Permission and order status retrieved successfully',
    schema: {
      example: {
        canRate: true,
        reason: 'You can rate the winner (bidder) of this auction',
        ratingTarget: 'BIDDER',
        hasAlreadyRated: false,
        userRole: 'SELLER',
        productInfo: { id: 'prod-123', name: 'iPhone 15', status: 'COMPLETED' },
        order: {
          hasOrder: true,
          orderId: 'order-uuid',
          orderStatus: 'SHIPPING_INFO_PENDING',
          needsAction: true,
          actionRequired: 'Buyer needs to submit shipping address',
          redirectToOrderPage: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Product not found',
  })
  async checkReviewPermission(@Param('productId') productId: string, @CurrentUser() user: any) {
    return this.productsService.checkReviewPermission(productId, user.id);
  }

  @Public()
  @Get(':id/related')
  @ApiOperation({
    summary: 'Get related products by category (Public)',
    description: 'Fetch products related to the given product based on category',
  })
  @ApiResponse({ status: 200, description: 'Related products retrieved successfully' })
  async getRelatedProducts(@Param('id') id: string): Promise<Product[]> {
    return this.productsService.findRelatedProducts(id);
  }

  @Get('products/:productId/my-bid')
  async getMyCurrentBid(@Param('productId') productId: string, @CurrentUser() user: any) {
    return this.bidsService.getMyCurrentBid(productId, user.id);
  }

  // ==================== Protected Routes (SELLER/ADMIN) ====================

  @Post()
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new product (SELLER/ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 403, description: 'Only SELLER or ADMIN can create products' })
  @ApiResponse({ status: 400, description: 'Invalid product data' })
  @ApiBody({ type: CreateProductDto })
  create(@Body() createProductDto: CreateProductDto, @CurrentUser() user: any): Promise<Product> {
    return this.productsService.create(createProductDto, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update product (SELLER/ADMIN)',
    description: 'SELLER can only update their own products. ADMIN can update any product.',
  })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 403, description: 'Not allowed to update this product' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiBody({ type: UpdateProductDto })
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: any,
  ): Promise<Product> {
    return this.productsService.update(id, updateProductDto, user.id, user.role);
  }

  @Delete(':id')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete product (SELLER/ADMIN)',
    description: 'SELLER can only delete their own products. ADMIN can delete any product.',
  })
  @ApiResponse({ status: 204, description: 'Product deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not allowed to delete this product' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  remove(@Param('id') id: string, @CurrentUser() user: any): Promise<Product> {
    return this.productsService.remove(id, user.id, user.role);
  }

  // ==================== Admin Only Routes ====================

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all products including inactive (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'All products retrieved successfully' })
  findAll(@Query() getUserProductDto: GetUserProductDto) {
    return this.productsService.findAll({ getUserProductDto });
  }

  @Patch(':id/admin')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Admin update product status/winner (ADMIN only)',
    description: 'Admin can update product status (COMPLETED, CANCELED) and set winnerId',
  })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiBody({ type: AdminUpdateProductDto })
  async adminUpdateProduct(
    @Param('id') id: string,
    @Body() adminUpdateDto: AdminUpdateProductDto,
  ): Promise<Product> {
    return this.productsService.adminUpdateProduct(id, adminUpdateDto);
  }

  // ==================== Description History CRUD ====================

  @Public()
  @Get('description-history/:historyId')
  @ApiOperation({
    summary: 'Get single description history entry (Public)',
    description: 'Get details of a specific description history entry by ID',
  })
  @ApiResponse({
    status: 200,
    description: 'History entry retrieved successfully',
    type: DescriptionHistoryDto,
  })
  @ApiResponse({ status: 404, description: 'History entry not found' })
  async getHistoryById(@Param('historyId') historyId: string): Promise<DescriptionHistoryDto> {
    return await this.productsService.getDescriptionHistoryById(historyId);
  }

  @Patch('description-history/:historyId')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update description history entry (SELLER/ADMIN)',
    description:
      'Update a description history entry. Only creator, product seller, or admin can update.',
  })
  @ApiResponse({
    status: 200,
    description: 'History entry updated successfully',
    type: DescriptionHistoryDto,
  })
  @ApiResponse({ status: 403, description: 'Not allowed to update this history entry' })
  @ApiResponse({ status: 404, description: 'History entry not found' })
  async updateHistory(
    @Param('historyId') historyId: string,
    @Body() updateDto: UpdateDescriptionHistoryDto,
    @CurrentUser() user: any,
  ): Promise<DescriptionHistoryDto> {
    return await this.productsService.updateDescriptionHistory(
      historyId,
      updateDto,
      user.id,
      user.role,
    );
  }

  @Delete('description-history/:historyId')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete description history entry (SELLER/ADMIN)',
    description:
      'Delete a history entry. Only product seller or admin can delete. Cannot delete the last entry.',
  })
  @ApiResponse({
    status: 200,
    description: 'History entry deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Description history entry deleted successfully' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cannot delete the last history entry' })
  @ApiResponse({ status: 403, description: 'Not allowed to delete this history entry' })
  @ApiResponse({ status: 404, description: 'History entry not found' })
  async deleteHistory(
    @Param('historyId') historyId: string,
    @CurrentUser() user: any,
  ): Promise<{ message: string }> {
    return await this.productsService.deleteDescriptionHistory(historyId, user.id, user.role);
  }
}
