/* eslint-disable @typescript-eslint/no-unsafe-argument */

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
  constructor(private readonly productsService: ProductsService) {}

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
  @Get(':id')
  @ApiOperation({ summary: 'Get product details by ID (Public)' })
  @ApiResponse({ status: 200, description: 'Product found' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
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
    summary: 'Check if user can rate/review the product',
    description:
      'Returns permission status and reason. User can rate if they are the seller (rate winner) or winner (rate seller) of a completed product',
  })
  @ApiResponse({
    status: 200,
    description: 'Permission check successful',
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
    description: 'Fetch products related to the given product based on category'})
  @ApiResponse({status: 200, description: 'Related products retrieved successfully'})
  async getRelatedProducts(
    @Param('id') id: string
  ): Promise<Product[]> {
    return this.productsService.findRelatedProducts(id);
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
