// src/favorites/dto/favorite-item.dto.ts
import { ApiProperty } from '@nestjs/swagger';

class CategoryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

class SellerDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fullName: string;
}

export class FavoriteItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  mainImage: string | null;

  @ApiProperty()
  currentPrice: number;

  @ApiProperty({ nullable: true })
  buyNowPrice: number | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  endTime: Date;

  @ApiProperty()
  timeRemaining: number;

  @ApiProperty()
  totalBids: number;

  @ApiProperty({ type: CategoryDto })
  category: CategoryDto;

  @ApiProperty({ type: SellerDto })
  seller: SellerDto;

  @ApiProperty()
  favoritedAt: Date;
}
