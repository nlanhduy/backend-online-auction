import { retry, take } from 'rxjs';
import { GetUserProductDto } from 'src/user/dto/get-user-product.dto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../system-setting/system-settings.service';
import { CreateProductDto } from './dto/create-product.dto';
import {
  DescriptionHistoryDto,
  DescriptionHistoryResponseDto,
} from './dto/description-history.dto';
import { SearchProductDto, SearchType, SortBy } from './dto/search-product.dto';
import { ProductItemDto, SearchResponseDto } from './dto/search-response.dto';
import { UpdateDescriptionHistoryDto } from './dto/update-description-history.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private systemSettingsService: SystemSettingsService,
  ) {}
  async create(createProductDto: CreateProductDto, sellerId: string) {
    const settings = await this.systemSettingsService.getSettings();

    if (createProductDto.images.length < settings.minImages) {
      throw new BadRequestException(`At least ${settings.minImages} product images are required`);
    }

    if (
      createProductDto.buyNowPrice &&
      createProductDto.buyNowPrice <= createProductDto.initialPrice
    ) {
      throw new BadRequestException(`Buy Now price must be greater than starting price`);
    }

    const startTime = new Date(createProductDto.startTime);
    const endTime = new Date(createProductDto.endTime);
    if (startTime >= endTime) {
      throw new BadRequestException(`End time must be after start time`);
    }

    if (startTime <= new Date()) {
      throw new BadRequestException(`Start time must be in the future`);
    }

    if (createProductDto.priceStep > createProductDto.initialPrice * 0.5) {
      throw new BadRequestException(
        `Price step must not be greater than 50% of the starting price`,
      );
    }

    // Sử dụng transaction để tạo product và description history cùng lúc
    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo product
      const product = await tx.product.create({
        data: {
          ...createProductDto,
          sellerId,
          currentPrice: createProductDto.initialPrice,
          descriptionHistory: [createProductDto.description],
          originalEndTime: createProductDto.autoExtend ? endTime : null,
          startTime,
          endTime,
        },
        include: {
          category: true,
          seller: { select: { id: true, fullName: true } },
        },
      });

      // 2. Tạo description history entry đầu tiên
      await tx.descriptionHistory.create({
        data: {
          description: createProductDto.description,
          productId: product.id,
          createdBy: sellerId,
        },
      });

      return product;
    });
  }

  async findAll({ getUserProductDto }: { getUserProductDto: GetUserProductDto }) {
    const { page = 1, limit = 10 } = getUserProductDto;
    const skip = (page - 1) * limit;
    const now = new Date();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          category: true,

          seller: {
            select: {
              id: true,
              fullName: true,
            },
          },

          bids: {
            where: { rejected: false },
            orderBy: { amount: 'desc' },
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
      }),

      this.prisma.product.count(),
    ]);

    const mappedItems = items.map((product) => ({
      id: product.id,
      name: product.name,
      mainImage: product.mainImage,
      currentPrice: product.currentPrice,
      buyNowPrice: product.buyNowPrice,
      createdAt: product.createdAt,
      endTime: product.endTime,
      timeRemaining: product.endTime.getTime() - now.getTime(),
      totalBids: product._count.bids,
      highestBidder: product.bids[0]?.user || null,
      category: product.category,
      seller: product.seller,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      items: mappedItems,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, fullName: true } },
        category: true,
        descriptionHistories: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Chỉ lấy entry mới nhất
          select: {
            description: true,
            createdAt: true,
            createdBy: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id: ${id} does not exist`);
    }

    // Lấy description mới nhất từ history
    const latestHistory = product.descriptionHistories[0];

    // Destructure để bỏ descriptionHistory array cũ và description gốc
    const { descriptionHistory, descriptionHistories, description, ...productData } = product;

    // Trả về format mới với description là object
    return {
      ...productData,
      descriptionHistories,
      description: {
        content: latestHistory?.description || description,
        createdAt: latestHistory?.createdAt,
        createdBy: latestHistory?.createdBy,
      },
    };
  }

  // async update(id: string, updateProductDto: UpdateProductDto, userId: string, userRole: string) {
  //   const existingProduct = await this.prisma.product.findUnique({ where: { id } });
  //   if (!existingProduct) {
  //     throw new NotFoundException(`Product with id: ${id} does not exist`);
  //   }

  //   // ADMIN can update any product, SELLER can only update their own
  //   if (userRole !== 'ADMIN' && existingProduct.sellerId !== userId) {
  //     throw new ForbiddenException(`You are not allowed to update this product`);
  //   }

  //   return this.prisma.product.update({
  //     where: { id },
  //     data: {
  //       ...updateProductDto,
  //       ...(updateProductDto.description
  //         ? { descriptionHistory: { push: updateProductDto.description } }
  //         : {}),
  //     },
  //   });
  // }
  async update(id: string, updateProductDto: UpdateProductDto, userId: string, userRole: string) {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        description: true,
        currentPrice: true,
        sellerId: true,
      },
    });

    if (!existingProduct) {
      throw new NotFoundException(`Product with id: ${id} does not exist`);
    }

    if (userRole !== 'ADMIN' && existingProduct.sellerId !== userId) {
      throw new ForbiddenException(`You are not allowed to update this product`);
    }

    if (updateProductDto.images) {
      const settings = await this.systemSettingsService.getSettings();
      if (updateProductDto.images.length < settings.minImages) {
        throw new BadRequestException(`Need at least ${settings.minImages} product images`);
      }
    }

    if (updateProductDto.buyNowPrice) {
      const priceToCompare = updateProductDto.initialPrice || existingProduct.currentPrice;
      if (updateProductDto.buyNowPrice <= priceToCompare) {
        throw new BadRequestException('Buy now price must be greater than the current price');
      }
    }

    // Kiểm tra xem description có thay đổi không
    const isDescriptionChanged =
      updateProductDto.description && updateProductDto.description !== existingProduct.description;

    // Sử dụng transaction để update product và tạo history
    return this.prisma.$transaction(async (tx) => {
      // 1. Update product
      const updatedProduct = await tx.product.update({
        where: { id },
        data: {
          ...updateProductDto,
          ...(updateProductDto.description
            ? { descriptionHistory: { push: updateProductDto.description } }
            : {}),
        },
        include: {
          category: true,
          seller: { select: { id: true, fullName: true } },
        },
      });

      // 2. Nếu description thay đổi, tạo history entry mới
      if (isDescriptionChanged) {
        await tx.descriptionHistory.create({
          data: {
            description: updateProductDto.description!,
            productId: id,
            createdBy: userId,
          },
        });
      }

      return updatedProduct;
    });
  }

  async getDescriptionHistory(productId: string): Promise<DescriptionHistoryResponseDto> {
    // Kiểm tra product có tồn tại không
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        description: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    // Lấy tất cả description history, sắp xếp từ mới nhất đến cũ nhất
    const historyRecords = await this.prisma.descriptionHistory.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        description: true,
        createdAt: true,
        createdBy: true,
      },
    });

    return {
      productId: product.id,
      currentDescription: product.description,
      history: historyRecords.map((record) => ({
        id: record.id,
        description: record.description,
        createdAt: record.createdAt,
        createdBy: record.createdBy ?? undefined,
      })),
      totalChanges: historyRecords.length,
    };
  }

  // ==================== Description History CRUD ====================

  /**
   * Get single description history entry by ID
   */
  async getDescriptionHistoryById(historyId: string): Promise<DescriptionHistoryDto> {
    const history = await this.prisma.descriptionHistory.findUnique({
      where: { id: historyId },
      select: {
        id: true,
        description: true,
        createdAt: true,
        createdBy: true,
      },
    });

    if (!history) {
      throw new NotFoundException(`Description history with id ${historyId} not found`);
    }

    return {
      id: history.id,
      description: history.description,
      createdAt: history.createdAt,
      createdBy: history.createdBy ?? undefined,
    };
  }

  /**
   * Update description history entry
   * Nếu update entry mới nhất, sẽ tự động update product description
   */
  async updateDescriptionHistory(
    historyId: string,
    updateDto: UpdateDescriptionHistoryDto,
    userId: string,
    userRole: string,
  ): Promise<DescriptionHistoryDto> {
    const history = await this.prisma.descriptionHistory.findUnique({
      where: { id: historyId },
      include: {
        product: {
          select: {
            id: true,
            sellerId: true,
            description: true,
          },
        },
      },
    });

    if (!history) {
      throw new NotFoundException(`Description history with id ${historyId} not found`);
    }

    // Check permissions: ADMIN, or original creator, or product seller
    const isAdmin = userRole === 'ADMIN';
    const isCreator = history.createdBy === userId;
    const isSeller = history.product.sellerId === userId;

    if (!isAdmin && !isCreator && !isSeller) {
      throw new ForbiddenException('You do not have permission to update this description history');
    }

    // Kiểm tra xem đây có phải là entry mới nhất không
    const latestHistory = await this.prisma.descriptionHistory.findFirst({
      where: { productId: history.productId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const isLatestEntry = latestHistory?.id === historyId;

    // Sử dụng transaction để update cả history và product (nếu là entry mới nhất)
    return this.prisma.$transaction(async (tx) => {
      // 1. Update description history
      const updated = await tx.descriptionHistory.update({
        where: { id: historyId },
        data: {
          description: updateDto.description,
        },
        select: {
          id: true,
          description: true,
          createdAt: true,
          createdBy: true,
        },
      });

      // 2. Nếu đây là entry mới nhất, update product description
      if (isLatestEntry) {
        await tx.product.update({
          where: { id: history.productId },
          data: {
            description: updateDto.description,
          },
        });
      }

      return {
        id: updated.id,
        description: updated.description,
        createdAt: updated.createdAt,
        createdBy: updated.createdBy ?? undefined,
      };
    });
  }

  /**
   * Delete description history entry
   * Only ADMIN or product seller can delete
   */
  async deleteDescriptionHistory(
    historyId: string,
    userId: string,
    userRole: string,
  ): Promise<{ message: string }> {
    const history = await this.prisma.descriptionHistory.findUnique({
      where: { id: historyId },
      include: {
        product: {
          select: {
            id: true,
            sellerId: true,
          },
        },
      },
    });

    if (!history) {
      throw new NotFoundException(`Description history with id ${historyId} not found`);
    }

    // Check permissions: ADMIN or product seller
    const isAdmin = userRole === 'ADMIN';
    const isSeller = history.product.sellerId === userId;

    if (!isAdmin && !isSeller) {
      throw new ForbiddenException('You do not have permission to delete this description history');
    }

    // Check if this is the only history entry for the product
    const historyCount = await this.prisma.descriptionHistory.count({
      where: { productId: history.product.id },
    });

    if (historyCount <= 1) {
      throw new BadRequestException(
        'Cannot delete the last description history entry. Product must have at least one history record.',
      );
    }

    await this.prisma.descriptionHistory.delete({
      where: { id: historyId },
    });

    return {
      message: `Description history entry deleted successfully`,
    };
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
    const useFTS =
      query &&
      query.trim() !== '' &&
      (searchType === SearchType.NAME || searchType === SearchType.BOTH);

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
    const conditions: string[] = [`p.status = 'ACTIVE'`, `p."endTime" > $1`];

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

        if (!fullProduct) {
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
