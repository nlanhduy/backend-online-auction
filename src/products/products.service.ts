import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { retry, take } from 'rxjs';
import { SearchProductDto, SearchType, SortBy } from './dto/search-product.dto';
import { ProductItemDto, SearchResponseDto } from './dto/search-response.dto';

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

  async update(id: string, updateProductDto: UpdateProductDto, sellerId: string) {
    const existingProduct = await this.prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      throw new NotFoundException(`Product with id: ${id} does not exist`);
    }
    if (existingProduct.sellerId !== sellerId) {
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

  async remove(id: string, sellerId: string) {
    const existingProduct = await this.prisma.product.findUnique({ where: { id } });
    if (!existingProduct) {
      throw new NotFoundException(`Product with id: ${id} does not exist`);
    }
    if (existingProduct.sellerId !== sellerId) {
      throw new ForbiddenException(`You are not allowed to delete this product`);
    }

    return this.prisma.product.delete({ where: { id } });
  }

  // find products for homepage
  async getHomepageProducts() {
    const now=new Date();
    // Query base
    const baseSelect={
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


    }

    // Top products ending soon
    const endingSoon=await this.prisma.product.findMany({
      where:{

      },
      select:baseSelect,
      orderBy:[
        { endTime: 'asc' }
      ],
      take:5
    });

    // Top 5 products with most bids
    const mostBids=await this.prisma.product.findMany({
      where:{
        status:'ACTIVE',
        endTime: { gt: now },
      },
      select:baseSelect,
      orderBy:[
        { bids:{_count:'desc'} },
      ],
      take:5
    });
    // Top 5 highest priced products
    const highestPriced=await this.prisma.product.findMany({
      where:{
        status:'ACTIVE',
        endTime: { gt: now },
      },
      select:baseSelect,
      orderBy:{currentPrice:'desc'},
      take:5,
    })

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
    return{
      endingSoon: endingSoon.map(transformProduct),
      mostBids: mostBids.map(transformProduct),
      highestPriced: highestPriced.map(transformProduct),
    }

  }

  // search products with filter, pagination and sorting
  async searchProducts(searchProductDto:SearchProductDto):Promise<SearchResponseDto>{
    const {page=1, limit=10, searchType=SearchType.NAME, query, categoryId, sortBy=SortBy.END_TIME_ASC}=searchProductDto;
    // Validate search param
    // if(searchType===SearchType.NAME&&(!query||query.trim()==='')){
    //   throw new BadRequestException("Query parameter is required for search type 'name'");  
    // }
    // else if(searchType===SearchType.CATEGORY&&(!categoryId||categoryId.trim()==='')){
    //   throw new BadRequestException("CategoryId parameter is required for search type 'category'");  
    // }
    // if(searchType===SearchType.BOTH&&(!query||query.trim()==='')&&(!categoryId||categoryId.trim()=='')){
    //   throw new BadRequestException("At least one of Query or CategoryId parameter is required for search type 'both'");  
    // }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const now=new Date();

    // Build where clause=> only take active products
    const where:any={
      status:'ACTIVE',
      endTime: { gt: now },
    }

    // Handle search based on searchType
    if (searchType === SearchType.NAME && query&&query.trim()!=='') {
      // Search by name only if query is provided
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } }      ];
    } else if (searchType === SearchType.CATEGORY && categoryId&&categoryId.trim()!=='') {
      // Search by category only
      where.categoryId = categoryId;
    } else if (searchType === SearchType.BOTH) {
      // Search by both name and category
      if (query) {
        where.OR = [
          { name: { contains: query, mode: 'insensitive' } }        ];
      }
      if (categoryId&&categoryId.trim()!=='') {
        where.categoryId = categoryId;
      }
    }

    // Build orderBy clause
    let orderBy:any={};
    switch (sortBy) {
      case SortBy.END_TIME_ASC:
        orderBy = { endTime: 'asc' };
        break;
      case SortBy.END_TIME_DESC:
        orderBy = { endTime: 'desc' };
        break;
      case SortBy.PRICE_ASC:
        orderBy = { currentPrice: 'asc' };
        break;
      case SortBy.PRICE_DESC:
        orderBy = { currentPrice: 'desc' };
        break;
      case SortBy.NEWEST:
        orderBy = { createdAt: 'desc' };
        break;
      case SortBy.MOST_BIDS:
        orderBy = { bids: { _count: 'desc' } };
        break;
      default:
        orderBy = { endTime: 'asc' };
    }

    // Base select for products
    const baseSelect={
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
      seller:{
        select:{
          id:true,
          fullName:true,
        }
      },
      bids:{
        where: { rejected: false },
        orderBy: { amount: 'desc' as const },
        take: 1,
        select:{
          amount:true,
          user:{
            select:{
              id:true,
              fullName:true,
            }
          }
        }
      },
      _count:{
        select:{
          bids:{
            where:{ rejected: false},
          }
        }
      }

    };

    // Execute queries
    const[products, total]=await Promise.all([
      this.prisma.product.findMany({
        where, 
        select: baseSelect,
        orderBy,
        skip:skip,
        take: limitNum,
      }),
      this.prisma.product.count({ where }),
    ])

    // Transform products
    const transformedProducts: ProductItemDto[] = products.map((product) => ({
      id: product.id,
      name: product.name,
      mainImage: product.images[0] || null,
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

    const totalPages=Math.ceil(total/limitNum);
    return {
      products:transformedProducts,
      total,
      page:pageNum,
      limit:limitNum,
      totalPages,
      hasNext: pageNum<totalPages,
      hasPrevious: pageNum>1,
      searchType,
      query:query||undefined, //return undefined if not provided
      categoryId:categoryId||undefined, // return undefined if not provided
      sortBy,
    };

  }
}
