/* eslint-disable prettier/prettier */
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
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ==================== Public Routes ====================
  
  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all categories (Public)' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Public()
  @Get('with-children')
  @ApiOperation({ summary: 'Get all parent categories with their children (Public)' })
  @ApiResponse({ 
    status: 200, 
    description: 'List of parent categories with children.',
    schema: {
      example: [
        {
          id: 'uuid-1',
          name: 'Electronics',
          parentId: null,
          children: [
            { id: 'uuid-2', name: 'Laptops', parentId: 'uuid-1' },
            { id: 'uuid-3', name: 'Phones', parentId: 'uuid-1' }
          ]
        }
      ]
    }
  })
  findAllWithChildren() {
    return this.categoriesService.findAllWithChildren();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID (Public)' })
  @ApiResponse({ status: 200, description: 'Category found' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  // ==================== Admin Only Routes ====================
  
  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new category (ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 403, description: 'Only ADMIN can create categories' })
  @ApiBody({ type: CreateCategoryDto })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update category (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiBody({ type: UpdateCategoryDto })
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete category (ADMIN only)' })
  @ApiResponse({ status: 204, description: 'Category deleted successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
