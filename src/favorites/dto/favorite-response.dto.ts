// src/favorites/dto/favorites-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

import { FavoriteItemDto } from './favorite-item.dto';

export class FavoritesResponseDto {
  @ApiProperty({ type: [FavoriteItemDto] })
  favorites: FavoriteItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  hasNext: boolean;

  @ApiProperty()
  hasPrevious: boolean;
}
