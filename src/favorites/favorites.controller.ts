/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/favorites/favorites.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/currentUser.decorator';
import { AddFavoriteDto } from './dto/add-favorite.dto';
import { FavoritesResponseDto } from './dto/favorite-response.dto';
import { FavoritesService } from './favorites.service';

@ApiTags('favorites')
@ApiBearerAuth('access-token')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add product to favorites' })
  @ApiResponse({
    status: 201,
    description: 'Product added to favorites successfully',
    schema: {
      properties: {
        id: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Product not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Product already in favorites',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async addFavorite(@CurrentUser() user: any, @Body() addFavoriteDto: AddFavoriteDto) {
    return this.favoritesService.addFavorite(user.id, addFavoriteDto);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove product from favorites' })
  @ApiParam({
    name: 'productId',
    description: 'Product ID to remove from favorites',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Product removed from favorites successfully',
    schema: {
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Favorite not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Not your favorite',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async removeFavorite(@CurrentUser() user: any, @Param('productId') productId: string) {
    return this.favoritesService.removeFavorite(user.id, productId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all user favorites with pagination' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'List of user favorites',
    type: FavoritesResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getUserFavorites(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<FavoritesResponseDto> {
    return this.favoritesService.getUserFavorites(user.id, page, limit);
  }

  @Get('check/:productId')
  @ApiOperation({ summary: 'Check if product is favorited by current user' })
  @ApiParam({
    name: 'productId',
    description: 'Product ID to check',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns whether product is favorited',
    schema: {
      properties: {
        isFavorite: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async checkFavorite(@CurrentUser() user: any, @Param('productId') productId: string) {
    const isFavorite = await this.favoritesService.isFavorite(user.id, productId);
    return { isFavorite };
  }
}
