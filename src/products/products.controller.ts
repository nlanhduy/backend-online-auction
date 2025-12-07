/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Product, UserRole } from '@prisma/client';

import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import { HomepageResponseDto } from './dto/product-list-items';
import { SearchResponseDto } from './dto/search-response.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post()
  @Roles(UserRole.SELLER)
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product successfully created.' })
  @ApiBody({ type: CreateProductDto })
  create(@Body() createProductDto: CreateProductDto, @Req() req): Promise<Product> {
    const sellerId = req.user.sub;
    return this.productsService.create(createProductDto, sellerId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products' })
  @ApiResponse({ status: 200, description: 'List of all products.' })
  findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('homepage')
  @ApiOperation({ summary: 'Get products for homepage sections' })
  @ApiResponse({ status: 200, description: 'Homepage products retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getHomePageProducts():Promise<HomepageResponseDto>{
    return this.productsService.getHomepageProducts();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search products' })
  @ApiResponse({ status: 200, description: 'Products search results.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 12 })
  @ApiQuery({ name: 'searchType', required: false, enum: ['name', 'category', 'both'], example: 'name' })
  @ApiQuery({ name: 'query', required: false, type: String, example: 'laptop' })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['endTime_asc', 'endTime_desc', 'price_asc', 'price_desc', 'newest', 'most_bids'], example: 'price_asc' })
  async searchProducts(@Req() req):Promise<SearchResponseDto>{
    const queryParams=req.query;
    return this.productsService.searchProducts(queryParams);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Product not found.' })
  findOne(@Param('id') id: string): Promise<Product> {
    return this.productsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch(':id')
  @Roles(UserRole.SELLER)
  @ApiOperation({ summary: 'Update a product by ID' })
  @ApiResponse({ status: 200, description: 'Product updated successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiBody({ type: UpdateProductDto })
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Req() req,
  ): Promise<Product> {
    const sellerId = req.user.sub;
    return this.productsService.update(id, updateProductDto, sellerId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a product by ID' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  remove(@Param('id') id: string, @Req() req): Promise<Product> {
    const sellerId = req.user.sub;
    return this.productsService.remove(id, sellerId);
  }

  
}
