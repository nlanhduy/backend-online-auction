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

    // Check if FTS is available and query is provided
    const useFTS = query && query.trim() !== '' && (searchType === SearchType.NAME || searchType === SearchType.BOTH);
    
    if (useFTS) {
      const ftsAvailable = await this.checkFTSAvailability();
      if (ftsAvailable) {
        console.log('🚀 Using Full-Text Search');
        return this.fullTextSearch(searchProductDto);
      }
    }
    
    console.log('📝 Using Traditional LIKE Search');
    return this.traditionalSearch(searchProductDto);
  }

  // Traditional search with Prisma
  private async traditionalSearch(searchProductDto: SearchProductDto): Promise<SearchResponseDto> {
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

    private async fullTextSearch(searchProductDto: SearchProductDto): Promise<SearchResponseDto> {
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
    const sortByValue = sortBy || SortBy.END_TIME_ASC;

    if (!query || query.trim() === '') {
      // If no query, fall back to traditional search
      return this.traditionalSearch(searchProductDto);
    }
    // Convert query to tsquery format
    const tsquery = query.trim().split(/\s+/).join(' & ');
    console.log('📊 FTS Query:', { query, tsquery, now: now.toISOString() });

    // Build WHERE conditions
    const conditions: string[] = [
      `p.status = 'ACTIVE'`,
      `p."endTime" > $1`,
    ];

    const params: any[] = [now];
    let paramIndex = 2;

    // Add FTS condition
    if (searchType === SearchType.NAME || searchType === SearchType.BOTH) {
      conditions.push(`p."searchVector" @@ to_tsquery('english', $${paramIndex})`);
      params.push(tsquery);
      paramIndex++;
    }

    // Add category filter
    if (
      (searchType === SearchType.CATEGORY || searchType === SearchType.BOTH) &&
      categoryId &&
      categoryId.trim() !== ''
    ) {
      conditions.push(`p."categoryId" = $${paramIndex}`);
      params.push(categoryId);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Build ORDER BY
    let orderByClause: string;
    const sortByString = String(sortByValue);

    if (sortByString === 'mostBids') {
      // Special handling for mostBids - need to join with bids table
      orderByClause = `bid_count DESC, p."endTime" ASC`;
    } else {
      const orderByMap: Record<string, string> = {
        endTimeAsc: 'p."endTime" ASC',
        endTimeDesc: 'p."endTime" DESC',
        priceAsc: 'p."currentPrice" ASC',
        priceDesc: 'p."currentPrice" DESC',
        newest: 'p."createdAt" DESC',
      };
      orderByClause =
        orderByMap[sortByString] ||
        `ts_rank(p."searchVector", to_tsquery('english', $2)) DESC, p."endTime" ASC`;
    }

    // Main query
    const sql = `
      SELECT 
        p.id,
        p.name,
        p.images,
        p."currentPrice",
        p."buyNowPrice",
        p."createdAt",
        p."endTime",
        p."categoryId",
        p."sellerId",
        ts_rank(p."searchVector", to_tsquery('english', $2)) as rank,
        COUNT(b.id) FILTER (WHERE b.rejected = false) as bid_count
      FROM "Product" p
      LEFT JOIN "Bid" b ON b."productId" = p.id
      WHERE ${whereClause}
      GROUP BY p.id
      ORDER BY ${orderByClause}
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    params.push(limitNum, skip);

    console.log('🔍 SQL:', sql);
    console.log('📝 Params:', params);

    const products = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
    console.log('✅ Found products:', products.length);

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM "Product" p
      WHERE ${whereClause}
    `;

    const [{ total }] = await this.prisma.$queryRawUnsafe<[{ total: bigint }]>(
      countSql,
      ...params.slice(0, -2),
    );

    const totalCount = Number(total);

    // Enrich with relations
    const enrichedProducts = await this.enrichProducts(products);

    const totalPages = Math.ceil(totalCount / limitNum);
    return {
      products: enrichedProducts,
      total: totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrevious: pageNum > 1,
      searchType,
      query: query || undefined,
      categoryId: categoryId || undefined,
      sortBy: String(sortByValue),
    };
  }

  // Check if Full-Text Search is supported
  private async checkFTSAvailability(): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<[{ exists: boolean }]>`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'Product' 
          AND column_name = 'searchVector'
        ) as exists;
      `;
      const isAvailable = result[0]?.exists || false;
      console.log(isAvailable ? 'Full-Text Search enabled' : 'Using fallback LIKE search');
      return isAvailable;
    } catch {
      return false;
    }
  }

  // Enrich products with relations
  private async enrichProducts(products: any[]): Promise<ProductItemDto[]> {
    const now = new Date();

    const enriched = await Promise.all(
      products.map(async (product) => {
        const fullProduct = await this.prisma.product.findUnique({
          where: { id: product.id },
          include: {
            category: { select: { id: true, name: true } },
            seller: { select: { id: true, fullName: true } },
            bids: {
              where: { rejected: false },
              orderBy: { amount: 'desc' },
              take: 1,
              select: {
                user: { select: { id: true, fullName: true } },
              },
            },
            _count: {
              select: {
                bids: { where: { rejected: false } },
              },
            },
          },
        });

        if(!fullProduct){
          return null;
        }
        const productItem: ProductItemDto = {
          id: fullProduct.id,
          name: fullProduct.name,
          mainImage: fullProduct.images[0] || null,
          currentPrice: fullProduct.currentPrice,
          buyNowPrice: fullProduct.buyNowPrice,
          createdAt: fullProduct.createdAt,
          endTime: fullProduct.endTime,
          timeRemaining: Math.max(0, fullProduct.endTime.getTime() - now.getTime()),
          totalBids: fullProduct._count.bids,
          highestBidder: fullProduct.bids[0]?.user || null,
          category: fullProduct.category,
          seller: fullProduct.seller,
        };

        return productItem;
      }),
    );

    return enriched.filter((product): product is ProductItemDto => product !== null);
  }

  private transformProducts(products: any[]): ProductItemDto[] {
    const now = new Date();

    return products.map((product) => ({
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
  }

  // Get orderBy clause based on sortBy
  private getOrderByClause(sortByValue: string): any {
    switch (sortByValue) {
      case 'endTimeAsc':
      case SortBy.END_TIME_ASC:
        return { endTime: 'asc' };
      case 'endTimeDesc':
      case SortBy.END_TIME_DESC:
        return { endTime: 'desc' };
      case 'priceAsc':
      case SortBy.PRICE_ASC:
        return { currentPrice: 'asc' };
      case 'priceDesc':
      case SortBy.PRICE_DESC:
        return { currentPrice: 'desc' };
      case 'newest':
      case SortBy.NEWEST:
        return { createdAt: 'desc' };
      case 'mostBids':
      case SortBy.MOST_BIDS:
        return { endTime: 'asc' };
      default:
        return { endTime: 'asc' };
    }
  }



}
