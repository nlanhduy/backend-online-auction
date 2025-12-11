// src/favorites/favorites.service.ts
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AddFavoriteDto } from './dto/add-favorite.dto';
import { FavoriteItemDto } from './dto/favorite-item.dto';
import { FavoritesResponseDto } from './dto/favorite-response.dto';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async addFavorite(userId: string, addFavoriteDto: AddFavoriteDto) {
    const { productId } = addFavoriteDto;

    if (!userId) {
      throw new ForbiddenException('Invalid user');
    }

    // Check if product exists and is active
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if already favorited
    const existingFavorite = await this.prisma.favoriteProduct.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingFavorite) {
      throw new ConflictException('Product already in favorites');
    }

    // Create favorite
    const favorite = await this.prisma.favoriteProduct.create({
      data: {
        userId,
        productId,
      },
      include: {
        product: {
          include: {
            category: true,
            seller: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    return {
      id: favorite.id,
      message: 'Product added to favorites successfully',
    };
  }

  async removeFavorite(userId: string, productId: string) {
    // Check if favorite exists
    const favorite = await this.prisma.favoriteProduct.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    // Verify ownership
    if (favorite.userId !== userId) {
      throw new ForbiddenException('You can only remove your own favorites');
    }

    // Delete favorite
    await this.prisma.favoriteProduct.delete({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    return { message: 'Product removed from favorites successfully' };
  }

  async getUserFavorites(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<FavoritesResponseDto> {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();

    // Base select for products
    const baseSelect = {
      id: true,
      userId: true,
      productId: true,
      createdAt: true,
      product: {
        select: {
          id: true,
          name: true,
          images: true,
          currentPrice: true,
          buyNowPrice: true,
          createdAt: true,
          endTime: true,
          status: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          seller: {
            select: {
              id: true,
              fullName: true,
            },
          },
          bids: {
            where: { rejected: false },
            orderBy: { amount: 'desc' as const },
            take: 1,
            select: {
              amount: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
          _count: {
            select: {
              bids: {
                where: { rejected: false },
              },
            },
          },
        },
      },
    };

    // Execute queries
    const [favorites, total] = await Promise.all([
      this.prisma.favoriteProduct.findMany({
        where: { userId },
        select: baseSelect,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitNum,
      }),
      this.prisma.favoriteProduct.count({ where: { userId } }),
    ]);

    // Transform favorites to match DTO
    const transformedFavorites: FavoriteItemDto[] = favorites.map((favorite) => ({
      id: favorite.product.id,
      name: favorite.product.name,
      mainImage: favorite.product.images[0] || null,
      currentPrice: favorite.product.currentPrice,
      buyNowPrice: favorite.product.buyNowPrice,
      createdAt: favorite.product.createdAt,
      endTime: favorite.product.endTime,
      timeRemaining: Math.max(0, favorite.product.endTime.getTime() - now.getTime()),
      totalBids: favorite.product._count.bids,
      category: favorite.product.category,
      seller: favorite.product.seller,
      favoritedAt: favorite.createdAt,
    }));

    const totalPages = Math.ceil(total / limitNum);

    return {
      favorites: transformedFavorites,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrevious: pageNum > 1,
    };
  }

  async isFavorite(userId: string, productId: string): Promise<boolean> {
    const favorite = await this.prisma.favoriteProduct.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    return !!favorite;
  }
}
