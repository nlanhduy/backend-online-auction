import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Name of the product', example: 'Apple iPhone 15' })
  name: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Description of the product', example: 'Latest iPhone model' })
  description: string;

  @IsNumber()
  @ApiProperty({ description: 'Initial price of the product', example: 1000 })
  initialPrice: number;

  @IsNumber()
  @ApiProperty({ description: 'Price increment step', example: 50 })
  priceStep: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Buy now price', example: 2000 })
  buyNowPrice?: number;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether to auto-extend auction', example: true })
  autoExtend?: boolean;

  @IsString()
  @ApiProperty({ description: 'Category ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  categoryId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({
    description: 'List of image URLs',
    example: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
    type: [String],
  })
  images?: string[];

  @IsDateString()
  @ApiProperty({ description: 'Auction end time in ISO format', example: '2025-12-31T23:59:59Z' })
  endTime: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Current price of the product', example: 1000 })
  currrentPrice?: number;
}
