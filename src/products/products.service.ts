/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
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

    return this.prisma.$transaction(async (tx) => {
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

  async findOne(id: string, userId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, fullName: true } },
        category: true,
        descriptionHistories: {
          orderBy: { createdAt: 'desc' },
          select: {
            description: true,
            createdAt: true,
            createdBy: true,
          },
        },
        Order: userId
          ? {
              include: {
                User_Order_buyerIdToUser: {
                  select: { id: true, fullName: true, email: true, avatar: true },
                },
                User_Order_sellerIdToUser: {
                  select: { id: true, fullName: true, email: true, avatar: true },
                },
                Rating_Order_buyerRatingIdToRating: true,
                Rating_Order_sellerRatingIdToRating: true,
              },
            }
          : false,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id: ${id} does not exist`);
    }

    // Lấy description mới nhất từ history
    const latestHistory = product.descriptionHistories[0];

    // Destructure để bỏ descriptionHistory array cũ và description gốc
    const {
      descriptionHistory,
      descriptionHistories,
      description,
      Order: order,
      ...productData
    } = product;

    const result = {
      ...productData,
      descriptionHistories,
      description: {
        content: latestHistory?.description || description,
        createdAt: latestHistory?.createdAt,
        createdBy: latestHistory?.createdBy,
      },
    };

    // Nếu sản phẩm đã kết thúc (COMPLETED/CANCELED)
    if (product.status !== 'ACTIVE') {
      // Debug logging
      console.log('🔍 Debug Order Info:');
      console.log('- userId:', userId);
      console.log('- product.winnerId:', product.winnerId);
      console.log('- product.sellerId:', product.sellerId);
      console.log('- order array:', order);

      // Nếu có order và user là buyer hoặc seller -> trả về order info
      const orderData = order;
      console.log('- orderData:', orderData);

      if (orderData && userId && (orderData.buyerId === userId || orderData.sellerId === userId)) {
        console.log('✅ User is buyer/seller - returning ORDER_FULFILLMENT');
        return {
          ...result,
          order: orderData,
          viewType: 'ORDER_FULFILLMENT', // Frontend dùng để hiển thị view phù hợp
        };
      }

      console.log('❌ No order or user not authorized - returning AUCTION_ENDED');

      // Người dùng khác chỉ thấy thông báo đã kết thúc
      return {
        ...result,
        viewType: 'AUCTION_ENDED',
        message: 'Sản phẩm đã kết thúc',
      };
    }

    // Sản phẩm đang active thì trả về bình thường
    return {
      ...result,
      viewType: 'ACTIVE_AUCTION',
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
      mainImage: true,
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
      mainImage: product.mainImage || null,
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
      newProductThresholdMinutes = 60,
    } = searchProductDto;

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();
    const thresholdMs = newProductThresholdMinutes * 60 * 1000;

    // Get sortBy value with default
    const sortByValue = sortBy || SortBy.END_TIME_ASC;

    // Build where clause=> only take active products
    const where: any = {
      status: 'ACTIVE',
      // Removed endTime filter to show all ACTIVE products including expired ones
      // If you want to filter by endTime, use: endTime: { gt: now }
    };

    // Handle search based on searchType
    if (searchType === SearchType.NAME && query && query.trim() !== '') {
      // Search by product name only
      where.OR = [{ name: { contains: query, mode: 'insensitive' } }];
    } else if (searchType === SearchType.CATEGORY) {
      // Search by category name
      if (query && query.trim() !== '') {
        where.category = {
          name: { contains: query, mode: 'insensitive' },
        };
      } else if (categoryId && categoryId.trim() !== '') {
        where.categoryId = categoryId;
      }
    } else if (searchType === SearchType.BOTH) {
      // Search by both product name and category name
      const conditions: any[] = [];
      
      if (query && query.trim() !== '') {
        conditions.push({ name: { contains: query, mode: 'insensitive' } });
        conditions.push({
          category: {
            name: { contains: query, mode: 'insensitive' },
          },
        });
      }
      
      if (categoryId && categoryId.trim() !== '') {
        conditions.push({ categoryId });
      }
      
      if (conditions.length > 0) {
        where.OR = conditions;
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
      mainImage: true,
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

    // Transform products with isNew flag
    const transformedProducts: ProductItemDto[] = sortedProducts.map((product) => {
      const productAge = now.getTime() - product.createdAt.getTime();
      const isNew = productAge <= thresholdMs;

      return {
        id: product.id,
        name: product.name,
        mainImage: product.mainImage || null,
        currentPrice: product.currentPrice,
        buyNowPrice: product.buyNowPrice,
        createdAt: product.createdAt,
        endTime: product.endTime,
        timeRemaining: Math.max(0, product.endTime.getTime() - now.getTime()),
        totalBids: product._count.bids,
        highestBidder: product.bids[0]?.user || null,
        category: product.category,
        seller: product.seller,
        isNew,
      };
    });

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
      newProductThresholdMinutes = 60,
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
    // Convert query to tsquery format with unaccent for Vietnamese support
    const tsquery = query.trim().split(/\s+/).join(' & ');
    console.log('📊 FTS Query:', { query, tsquery, now: now.toISOString() });

    // Build WHERE conditions
    const baseConditions: string[] = [`p.status = 'ACTIVE'`, `p."endTime" > $1`];
    const searchConditions: string[] = [];

    const params: any[] = [now];
    let paramIndex = 2;

    // Add search condition based on search type
    if (searchType === SearchType.NAME) {
      // Search only in product name
      searchConditions.push(`p.name ILIKE $${paramIndex}`);
      params.push(`%${query}%`);
      paramIndex++;
    } else if (searchType === SearchType.CATEGORY) {
      // Search only in category name
      searchConditions.push(`c.name ILIKE $${paramIndex}`);
      params.push(`%${query}%`);
      paramIndex++;
    } else if (searchType === SearchType.BOTH) {
      // Search in both product name OR category name
      searchConditions.push(`(p.name ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex + 1})`);
      params.push(`%${query}%`, `%${query}%`);
      paramIndex += 2;
    }

    // Add exact category filter if provided
    if (categoryId && categoryId.trim() !== '') {
      baseConditions.push(`p."categoryId" = $${paramIndex}`);
      params.push(categoryId);
      paramIndex++;
    }

    // Combine conditions
    const allConditions = [...baseConditions];
    if (searchConditions.length > 0) {
      allConditions.push(...searchConditions);
    }
    
    const whereClause = allConditions.join(' AND ');

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
        `ts_rank(p."searchVector", to_tsquery('simple', $2)) DESC, p."endTime" ASC`;
    }

    // Main query
    const sql = `
      SELECT 
        p.id,
        p.name,
        p."mainImage",
        p."currentPrice",
        p."buyNowPrice",
        p."createdAt",
        p."endTime",
        p."categoryId",
        p."sellerId",
        COUNT(b.id) FILTER (WHERE b.rejected = false) as bid_count
      FROM "Product" p
      LEFT JOIN "Category" c ON c.id = p."categoryId"
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
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      WHERE ${whereClause}
    `;

    const [{ total }] = await this.prisma.$queryRawUnsafe<[{ total: bigint }]>(
      countSql,
      ...params.slice(0, -2),
    );

    const totalCount = Number(total);

    // Enrich with relations and add isNew flag
    const enrichedProducts = await this.enrichProducts(products, newProductThresholdMinutes);

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
  private async enrichProducts(
    products: any[],
    newProductThresholdMinutes: number = 60,
  ): Promise<ProductItemDto[]> {
    const now = new Date();
    const thresholdMs = newProductThresholdMinutes * 60 * 1000;

    const enriched = await Promise.all(
      products.map(async (product) => {
        const fullProduct = await this.prisma.product.findUnique({
          where: { id: product.id },
          select: {
            id: true,
            name: true,
            mainImage: true,
            currentPrice: true,
            buyNowPrice: true,
            createdAt: true,
            endTime: true,
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

        // Calculate if product is new (created within threshold)
        const productAge = now.getTime() - fullProduct.createdAt.getTime();
        const isNew = productAge <= thresholdMs;

        const productItem: ProductItemDto = {
          id: fullProduct.id,
          name: fullProduct.name,
          mainImage: fullProduct.mainImage || null,
          currentPrice: fullProduct.currentPrice,
          buyNowPrice: fullProduct.buyNowPrice,
          createdAt: fullProduct.createdAt,
          endTime: fullProduct.endTime,
          timeRemaining: Math.max(0, fullProduct.endTime.getTime() - now.getTime()),
          totalBids: fullProduct._count.bids,
          highestBidder: fullProduct.bids[0]?.user || null,
          category: fullProduct.category,
          seller: fullProduct.seller,
          isNew,
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
      mainImage: product.mainImage || null,
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

  /**
   * Check if user has permission to rate/review this product
   * User can rate if:
   * - They are the SELLER and product is COMPLETED (can rate the winner/bidder)
   * - They are the WINNER and product is COMPLETED (can rate the seller)
   */
  async checkReviewPermission(productId: string, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        status: true,
        sellerId: true,
        winnerId: true,
        seller: {
          select: {
            id: true,
            fullName: true,
          },
        },
        Order: {
          select: {
            id: true,
            status: true,
            paymentStatus: true,
            shippingSubmittedAt: true,
            sellerConfirmedAt: true,
            buyerConfirmedAt: true,
            isCancelled: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    // Fetch winner info separately
    let winner: { id: string; fullName: string } | null = null;
    if (product.winnerId) {
      winner = await this.prisma.user.findUnique({
        where: { id: product.winnerId },
        select: {
          id: true,
          fullName: true,
        },
      });
    }

    const isSeller = product.sellerId === userId;
    const isWinner = product.winnerId === userId;
    const isCompleted = product.status === 'COMPLETED';

    // Check if user already gave rating in this transaction
    // For seller: check if they rated the winner
    // For winner: check if they rated the seller
    let existingRating: {
      id: string;
      createdAt: Date;
      value: number;
      comment: string | null;
      giverId: string;
      receiverId: string;
    } | null = null;
    if (isSeller && product.winnerId) {
      existingRating = await this.prisma.rating.findFirst({
        where: {
          giverId: userId,
          receiverId: product.winnerId,
        },
        select: {
          id: true,
          createdAt: true,
          value: true,
          comment: true,
          giverId: true,
          receiverId: true,
        },
      });
    } else if (isWinner) {
      existingRating = await this.prisma.rating.findFirst({
        where: {
          giverId: userId,
          receiverId: product.sellerId,
        },
        select: {
          id: true,
          createdAt: true,
          value: true,
          comment: true,
          giverId: true,
          receiverId: true,
        },
      });
    }

    const hasAlreadyRated = !!existingRating;

    // Determine permission
    let canRate = false;
    let reason = '';
    let ratingTarget: 'SELLER' | 'BIDDER' | null = null;

    if (!isCompleted) {
      reason = 'Product auction must be completed before rating';
    } else if (hasAlreadyRated) {
      reason = 'You have already rated this transaction';
    } else if (isSeller && product.winnerId) {
      canRate = true;
      reason = 'You can rate the winner (bidder) of this auction';
      ratingTarget = 'BIDDER';
    } else if (isWinner) {
      canRate = true;
      reason = 'You can rate the seller of this product';
      ratingTarget = 'SELLER';
    } else if (isSeller && !product.winnerId) {
      reason = 'No winner for this auction yet';
    } else {
      reason = 'You are not involved in this transaction (not seller or winner)';
    }

    // Analyze order status and determine required actions
    const orderInfo = this.analyzeOrderStatus(product.Order, isSeller, isWinner);

    return {
      canRate,
      reason,
      ratingTarget,
      productInfo: {
        id: product.id,
        name: product.name,
        status: product.status,
      },
      seller: product.seller,
      winner,
      hasAlreadyRated,
      userRole: isSeller ? 'SELLER' : isWinner ? 'WINNER' : 'OBSERVER',
      order: orderInfo,
    };
  }

  /**
   * Analyze order status and determine UI actions
   */
  private analyzeOrderStatus(
    order: any,
    isSeller: boolean,
    isWinner: boolean,
  ): {
    hasOrder: boolean;
    orderId?: string;
    orderStatus?: string;
    needsAction: boolean;
    actionRequired?: string;
    redirectToOrderPage: boolean;
  } {
    if (!order) {
      return {
        hasOrder: false,
        needsAction: false,
        redirectToOrderPage: false,
      };
    }

    if (order.isCancelled) {
      return {
        hasOrder: true,
        orderId: order.id,
        orderStatus: 'CANCELLED',
        needsAction: false,
        actionRequired: 'Order has been cancelled',
        redirectToOrderPage: false,
      };
    }

    let needsAction = false;
    let actionRequired = '';

    // Check based on order status
    switch (order.status) {
      case 'SHIPPING_INFO_PENDING':
        if (isWinner) {
          needsAction = true;
          actionRequired = 'You need to submit shipping address';
        } else if (isSeller) {
          actionRequired = 'Waiting for buyer to submit shipping address';
        }
        break;

      case 'SELLER_CONFIRMATION_PENDING':
        if (isSeller) {
          needsAction = true;
          actionRequired = 'You need to confirm payment received and provide tracking number';
        } else if (isWinner) {
          actionRequired = 'Waiting for seller to confirm and ship';
        }
        break;

      case 'IN_TRANSIT':
        if (isWinner) {
          needsAction = true;
          actionRequired = 'Confirm when you receive the item';
        } else if (isSeller) {
          actionRequired = 'Waiting for buyer to confirm receipt';
        }
        break;

      case 'COMPLETED':
        actionRequired = 'Order completed successfully';
        needsAction = false;
        break;

      default:
        actionRequired = 'Unknown order status';
    }

    // Should redirect to order page if order exists and not completed
    const redirectToOrderPage = order.status !== 'COMPLETED' && !order.isCancelled;

    return {
      hasOrder: true,
      orderId: order.id,
      orderStatus: order.status,
      needsAction,
      actionRequired,
      redirectToOrderPage,
    };
  }

  /**
   * Admin update product status and winner
   * Used to manually complete auctions or set winners
   */
  async adminUpdateProduct(id: string, adminUpdateDto: any): Promise<any> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(adminUpdateDto.status && { status: adminUpdateDto.status }),
        ...(adminUpdateDto.winnerId && { winnerId: adminUpdateDto.winnerId }),
      },
      include: {
        category: true,
        seller: { select: { id: true, fullName: true } },
      },
    });
  }

  async findRelatedProducts(productId: string, limit: number = 5) {
    const currentProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        categoryId: true,
        id: true,
      },
    });

    if (!currentProduct) {
      throw new NotFoundException('Product not found');
    }

    // Bước 1: Lấy sản phẩm cùng category
    let relatedProducts = await this.prisma.product.findMany({
      where: {
        categoryId: currentProduct.categoryId,
        id: { not: productId },
        status: 'ACTIVE',
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        seller: { select: { id: true, fullName: true } },
        category: true,
        _count: { select: { bids: true } },
      },
    });

    // Bước 2: Nếu không đủ, lấy thêm từ parent category
    if (relatedProducts.length < limit) {
      const category = await this.prisma.category.findUnique({
        where: { id: currentProduct.categoryId },
        select: { parentId: true },
      });

      if (category?.parentId) {
        const remaining = limit - relatedProducts.length;
        const excludeIds = [productId, ...relatedProducts.map((p) => p.id)];

        const parentCategoryProducts = await this.prisma.product.findMany({
          where: {
            categoryId: category.parentId,
            id: { notIn: excludeIds },
            status: 'ACTIVE',
          },
          take: remaining,
          orderBy: { createdAt: 'desc' },
          include: {
            seller: { select: { id: true, fullName: true } },
            category: true,
            _count: { select: { bids: true } },
          },
        });

        relatedProducts = [...relatedProducts, ...parentCategoryProducts];
      }
    }

    // Bước 3: Nếu vẫn không đủ, lấy từ tất cả categories
    if (relatedProducts.length < limit) {
      const remaining = limit - relatedProducts.length;
      const excludeIds = [productId, ...relatedProducts.map((p) => p.id)];

      const otherProducts = await this.prisma.product.findMany({
        where: {
          id: { notIn: excludeIds },
          status: 'ACTIVE',
        },
        take: remaining,
        orderBy: { createdAt: 'desc' },
        include: {
          seller: { select: { id: true, fullName: true } },
          category: true,
          _count: { select: { bids: true } },
        },
      });

      relatedProducts = [...relatedProducts, ...otherProducts];
    }

    return relatedProducts;
  }

  // ==================== Bidder Management Methods ====================

  /**
   * Deny/kick a bidder from participating in the auction
   * Only product seller or admin can deny bidders
   */
  async denyBidder(productId: string, bidderId: string, userId: string, userRole: string) {
    // Get product
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sellerId: true, deniedBidders: true, status: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    // Check permission (only seller or admin)
    if (userRole !== 'ADMIN' && product.sellerId !== userId) {
      throw new ForbiddenException('You are not allowed to manage bidders for this product');
    }

    // Check if product is still active
    if (product.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot manage bidders for non-active products');
    }

    // Check if bidder exists
    const bidder = await this.prisma.user.findUnique({
      where: { id: bidderId },
      select: { id: true, fullName: true },
    });

    if (!bidder) {
      throw new NotFoundException(`Bidder with id ${bidderId} not found`);
    }

    // Check if bidder is the seller
    if (bidderId === product.sellerId) {
      throw new BadRequestException('Cannot deny the seller from their own product');
    }

    // Check if already denied
    if (product.deniedBidders.includes(bidderId)) {
      throw new BadRequestException('This bidder is already denied');
    }

    // Transaction: Add to denied list, reject all bids, recalculate winner
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Add to denied list
      await tx.product.update({
        where: { id: productId },
        data: {
          deniedBidders: {
            push: bidderId,
          },
        },
      });

      // 2. Reject all bids from this bidder
      await tx.bid.updateMany({
        where: {
          productId,
          userId: bidderId,
          rejected: false,
        },
        data: {
          rejected: true,
        },
      });

      // 3. Find new top bidder (highest non-rejected bid)
      const newTopBid = await tx.bid.findFirst({
        where: {
          productId,
          rejected: false,
        },
        orderBy: [
          { amount: 'desc' },
          { createdAt: 'asc' },
        ],
        include: {
          user: {
            select: { id: true, fullName: true },
          },
        },
      });

      // 4. Update product winner and current price
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: {
          winnerId: newTopBid?.userId || null,
          currentPrice: newTopBid?.amount || product.status === 'ACTIVE' ? await this.getInitialPrice(productId) : 0,
        },
        select: {
          id: true,
          name: true,
          deniedBidders: true,
          winnerId: true,
          currentPrice: true,
        },
      });

      return {
        updatedProduct,
        newTopBidder: newTopBid?.user || null,
        previousWinnerId: bidderId,
      };
    });

    return {
      message: 'Bidder denied successfully',
      deniedBidders: result.updatedProduct.deniedBidders,
      newWinner: result.newTopBidder,
      previousWinner: bidder.fullName,
    };
  }

  /**
   * Remove a bidder from deny list (allow them to bid again)
   */
  async allowBidder(productId: string, bidderId: string, userId: string, userRole: string) {
    // Get product
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sellerId: true, deniedBidders: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    // Check permission
    if (userRole !== 'ADMIN' && product.sellerId !== userId) {
      throw new ForbiddenException('You are not allowed to manage bidders for this product');
    }

    // Check if bidder is in deny list
    if (!product.deniedBidders.includes(bidderId)) {
      throw new BadRequestException('This bidder is not in the deny list');
    }

    // Remove from denied list
    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: {
        deniedBidders: product.deniedBidders.filter((id) => id !== bidderId),
      },
      select: { deniedBidders: true },
    });

    return {
      message: 'Bidder allowed successfully',
      deniedBidders: updatedProduct.deniedBidders,
    };
  }

  /**
   * Get initial price helper
   */
  private async getInitialPrice(productId: string): Promise<number> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { initialPrice: true },
    });
    return product?.initialPrice || 0;
  }

  /**
   * Get list of active bidders for a product
   */
  async getActiveBidders(productId: string, userId: string, userRole: string) {
    // Get product
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sellerId: true, winnerId: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    // Check permission (only seller or admin)
    if (userRole !== 'ADMIN' && product.sellerId !== userId) {
      throw new ForbiddenException('You are not allowed to view bidders for this product');
    }

    // Get all active bids grouped by user
    const bids = await this.prisma.bid.findMany({
      where: {
        productId,
        rejected: false,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: [
        { amount: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    // Group by user and get stats
    const bidderMap = new Map<string, {
      id: string;
      fullName: string;
      highestBid: number;
      totalBids: number;
      lastBidTime: Date;
    }>();

    bids.forEach((bid) => {
      const existing = bidderMap.get(bid.userId);
      if (!existing) {
        bidderMap.set(bid.userId, {
          id: bid.user.id,
          fullName: bid.user.fullName,
          highestBid: bid.amount,
          totalBids: 1,
          lastBidTime: bid.createdAt,
        });
      } else {
        existing.totalBids++;
        if (bid.createdAt > existing.lastBidTime) {
          existing.lastBidTime = bid.createdAt;
        }
      }
    });

    // Convert to array and sort by highest bid
    const bidders = Array.from(bidderMap.values())
      .map((bidder) => ({
        ...bidder,
        isWinning: bidder.id === product.winnerId,
      }))
      .sort((a, b) => b.highestBid - a.highestBid);

    return {
      bidders,
      currentWinnerId: product.winnerId,
    };
  }

  /**
   * Get list of denied bidders with their details
   */
  async getDeniedBidders(productId: string, userId: string, userRole: string) {
    // Get product
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sellerId: true, deniedBidders: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    // Check permission
    if (userRole !== 'ADMIN' && product.sellerId !== userId) {
      throw new ForbiddenException('You are not allowed to view denied bidders for this product');
    }

    // Get bidder details
    if (product.deniedBidders.length === 0) {
      return {
        deniedBidders: [],
        bidders: [],
      };
    }

    const bidders = await this.prisma.user.findMany({
      where: {
        id: { in: product.deniedBidders },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    });

    return {
      deniedBidders: product.deniedBidders,
      bidders,
    };
  }
}
