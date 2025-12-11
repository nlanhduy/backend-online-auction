import { IsNotEmpty, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class AddFavoriteDto {
  @ApiProperty({
    description: 'Product ID to add to favorites',
    example: 'prd-016',
  })
  @IsNotEmpty()
  @IsString()
  productId: string;
}
