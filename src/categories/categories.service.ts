import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  create(createCategoryDto: CreateCategoryDto) {
    return this.prisma.category.create({ data: createCategoryDto });
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      include: {
        children: true,
        _count: {
          select: { products: true },
        },
      },
    });

    return categories.map(({ _count, ...category }) => ({
      ...category,
      numsOfProducts: _count.products,
    }));
  }

  findAllWithChildren() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with the id: ${id} is not existed `);
    }
    return category;
  }

  update(id: string, updateCategoryDto: UpdateCategoryDto) {
    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }
  async remove(id: string) {
    const productCount = await this.prisma.product.count({
      where: { categoryId: id },
    });

    if (productCount > 0) {
      throw new BadRequestException('Cannot delete category because it has associated products');
    }

    const subCategoryCount = await this.prisma.category.count({
      where: { parentId: id },
    });

    if (subCategoryCount > 0) {
      throw new BadRequestException('Cannot delete category because it has subcategories');
    }

    return this.prisma.category.delete({
      where: { id },
    });
  }
}
