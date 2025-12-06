import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { retry, take } from 'rxjs';

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
}
