import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class AdminUpdateProductDto {
  @ApiPropertyOptional({
    description: 'Update product status (ADMIN only)',
    enum: ProductStatus,
    example: 'COMPLETED',
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    description: 'Set winner ID when completing auction (ADMIN only)',
    example: 'user-uuid',
  })
  @IsOptional()
  @IsString()
  winnerId?: string;
}
