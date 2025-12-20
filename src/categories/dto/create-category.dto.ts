import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Name of the category',
    example: 'Electronics',
  })
  name: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Description of the category',
    example: 'Category for electronic items',
  })
  description?: string;

  @IsString()
  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({
    description: 'Parent category ID, leave empty for top-level category',
    example: '1',
  })
  parentId?: string; // null or undefined for parent category
}
