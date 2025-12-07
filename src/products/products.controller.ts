/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
  Query 
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Product, UserRole } from '@prisma/client';

import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SearchProductDto } from './dto/search-product.dto';
import { ProductsService } from './products.service';
import { HomepageResponseDto } from './dto/product-list-items';
import { SearchResponseDto } from './dto/search-response.dto';
import { CurrentUser } from 'src/common/decorators/currentUser.decorator';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ==================== Public Routes ====================
  
  @Public()
  @Get('search')
  @ApiOperation({ 
    summary: 'Search products with filters (Public)',
    description: 'Search products by name, category, price range. Query is optional - can use filters only.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Products found successfully',
    type: SearchResponseDto 
  })
  async searchProducts(@Query() searchDto: SearchProductDto): Promise<SearchResponseDto> {
    return this.productsService.searchProducts(searchDto);
  }

  @Public()
  @Get('homepage')
  @ApiOperation({ 
    summary: 'Get homepage products (Public)',
    description: 'Returns ending soon, most bids, and highest priced products'
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
  findOne(@Param('id') id: string): Promise<Product> {
    return this.productsService.findOne(id);
  }

  // ==================== Protected Routes (SELLER/ADMIN) ====================
  
  @Post()
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new product (SELLER/ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 403, description: 'Only SELLER or ADMIN can create products' })
  @ApiResponse({ status: 400, description: 'Invalid product data' })
  @ApiBody({ type: CreateProductDto })
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: any,
  ): Promise<Product> {
    return this.productsService.create(createProductDto, user.sub);
  }

  @Patch(':id')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Update product (SELLER/ADMIN)',
    description: 'SELLER can only update their own products. ADMIN can update any product.'
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
    return this.productsService.update(id, updateProductDto, user.sub, user.role);
  }

  @Delete(':id')
  @Roles(UserRole.SELLER, UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Delete product (SELLER/ADMIN)',
    description: 'SELLER can only delete their own products. ADMIN can delete any product.'
  })
  @ApiResponse({ status: 204, description: 'Product deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not allowed to delete this product' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  remove(@Param('id') id: string, @CurrentUser() user: any): Promise<Product> {
    return this.productsService.remove(id, user.sub, user.role);
  }

  // ==================== Admin Only Routes ====================
  
  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all products including inactive (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'All products retrieved successfully' })
  findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }
}
