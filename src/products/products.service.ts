import { retry, take } from 'rxjs';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { SearchProductDto, SearchType, SortBy } from './dto/search-product.dto';
import { ProductItemDto, SearchResponseDto } from './dto/search-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  create(createProductDto: CreateProductDto, sellerId: string) {
    return this.prisma.product.create({
      data: {
        ...createProductDto,
        sellerId,
        currentPrice: createProductDto.initialPrice,
        descriptionHistory: [createProductDto.description],
      },
    });
  }

  findAll() {
    return this.prisma.product.findMany({
      include: {
        category: true,
        seller: { select: { id: true, fullName: true } },
      },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, fullName: true } },
        category: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id: ${id} does not exist`);
    }
    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, userId: string, userRole: string) {
    const existingProduct = await this.prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      throw new NotFoundException(`Product with id: ${id} does not exist`);
    }

    // ADMIN can update any product, SELLER can only update their own
    if (userRole !== 'ADMIN' && existingProduct.sellerId !== userId) {
      throw new ForbiddenException(`You are not allowed to update this product`);
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...updateProductDto,
        ...(updateProductDto.description
          ? { descriptionHistory: { push: updateProductDto.description } }
          : {}),
      },
    });
  }

  async remove(id: string, userId: string, userRole: string) {
    const existingProduct = await this.prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      throw new NotFoundException(`Product with id: ${id} does not exist`);
    }

    // ADMIN can delete any product, SELLER can only delete their own
    if (userRole !== 'ADMIN' && existingProduct.sellerId !== userId) {
      throw new ForbiddenException(`You are not allowed to delete this product`);
    }

    return this.prisma.product.delete({ where: { id } });
  }

  // find products for homepage
  async getHomepageProducts() {
    const now = new Date();
    // Query base
    const baseSelect = {
      id: true,
      name: true,
      images: true,
      currentPrice: true,
      buyNowPrice: true,
      createdAt: true,
      endTime: true,
      category: {
        select: {
          id: true,
          name: true,
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
    };

    // Top products ending soon
    const endingSoon = await this.prisma.product.findMany({
      where: {},
      select: baseSelect,
      orderBy: [{ endTime: 'asc' }],
      take: 5,
    });

    // Top 5 products with most bids
    const mostBids = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        endTime: { gt: now },
      },
      select: baseSelect,
      orderBy: [{ bids: { _count: 'desc' } }],
      take: 5,
    });
    // Top 5 highest priced products
    const highestPriced = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        endTime: { gt: now },
      },
      select: baseSelect,
      orderBy: { currentPrice: 'desc' },
      take: 5,
    });

    // transform data to match DTO
    const transformProduct = (product: any) => ({
      id: product.id,
      name: product.name,
      mainImage: product.images.length > 0 ? product.images[0] : null,
      currentPrice: product.currentPrice,
      buyNowPrice: product.buyNowPrice,
      createdAt: product.createdAt,
      endTime: product.endTime,
      timeRemaining: product.endTime.getTime() - now.getTime(),
      totalBids: product._count.bids,
      highestBidder: product.bids[0]?.user || null,
      category: product.category,
    });
    return {
      endingSoon: endingSoon.map(transformProduct),
      mostBids: mostBids.map(transformProduct),
      highestPriced: highestPriced.map(transformProduct),
    };
  }

  // search products with filter, pagination and sorting
  async searchProducts(searchProductDto: SearchProductDto): Promise<SearchResponseDto> {
    const {
      page = 1,
      limit = 10,
      searchType = SearchType.NAME,
      query,
      categoryId,
      sortBy,
    } = searchProductDto;

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();

    // Get sortBy value with default
    const sortByValue = sortBy || SortBy.END_TIME_ASC;

    // Build where clause=> only take active products
    const where: any = {
      status: 'ACTIVE',
      endTime: { gt: now },
    };

    // Handle search based on searchType
    if (searchType === SearchType.NAME && query && query.trim() !== '') {
      // Search by name only if query is provided
      where.OR = [{ name: { contains: query, mode: 'insensitive' } }];
    } else if (searchType === SearchType.CATEGORY && categoryId && categoryId.trim() !== '') {
      // Search by category only
      where.categoryId = categoryId;
    } else if (searchType === SearchType.BOTH) {
      // Search by both name and category
      if (query) {
        where.OR = [{ name: { contains: query, mode: 'insensitive' } }];
      }
      if (categoryId && categoryId.trim() !== '') {
        where.categoryId = categoryId;
      }
    }

    // Build orderBy clause
    let orderBy: any = {};

    switch (sortByValue) {
      case 'endTimeAsc':
      case SortBy.END_TIME_ASC:
        orderBy = { endTime: 'asc' };
        break;
      case 'endTimeDesc':
      case SortBy.END_TIME_DESC:
        orderBy = { endTime: 'desc' };
        break;
      case 'priceAsc':
      case SortBy.PRICE_ASC:
        orderBy = { currentPrice: 'asc' };
        break;
      case 'priceDesc':
      case SortBy.PRICE_DESC:
        orderBy = { currentPrice: 'desc' };
        break;
      case 'newest':
      case SortBy.NEWEST:
        orderBy = { createdAt: 'desc' };
        break;
      case 'mostBids':
      case SortBy.MOST_BIDS:
        // For mostBids, we'll need to handle it differently
        // We'll sort by bid count in memory after fetching
        orderBy = { endTime: 'asc' }; // Default order, will sort by bids later
        break;
      default:
        orderBy = { endTime: 'asc' };
    }

    // Base select for products
    const baseSelect = {
      id: true,
      name: true,
      images: true,
      currentPrice: true,
      buyNowPrice: true,
      createdAt: true,
      endTime: true,
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
    };

    // Execute queries
    // For mostBids, we need to fetch more records and sort manually
    const sortByString = String(sortByValue);
    const isMostBidsSort = sortByString === 'mostBids';
    const fetchLimit = isMostBidsSort ? limitNum * 3 : limitNum; // Fetch more for sorting
    const fetchSkip = isMostBidsSort ? 0 : skip; // Don't skip if we need to sort

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: baseSelect,
        orderBy,
        skip: fetchSkip,
        take: fetchLimit,
      }),
      this.prisma.product.count({ where }),
    ]);

    // Sort by mostBids if needed
    let sortedProducts = products;
    if (isMostBidsSort) {
      sortedProducts = [...products].sort((a, b) => b._count.bids - a._count.bids);
      // Apply pagination after sorting
      sortedProducts = sortedProducts.slice(skip, skip + limitNum);
    }

    // Transform products
    const transformedProducts: ProductItemDto[] = sortedProducts.map((product) => ({
      id: product.id,
      name: product.name,
      mainImage: product.images[0] || null,
      currentPrice: product.currentPrice,
      buyNowPrice: product.buyNowPrice,
      createdAt: product.createdAt,
      endTime: product.endTime,
      timeRemaining: Math.max(0, product.endTime.getTime() - now.getTime()),
      totalBids: product._count.bids,
      highestBidder: product.bids[0]?.user || null,
      category: product.category,
      seller: product.seller,
    }));

    const totalPages = Math.ceil(total / limitNum);
    return {
      products: transformedProducts,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrevious: pageNum > 1,
      searchType,
      query: query || undefined, //return undefined if not provided
      categoryId: categoryId || undefined, // return undefined if not provided
      sortBy: String(sortByValue),
    };
  }
}
