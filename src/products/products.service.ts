import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
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
}
