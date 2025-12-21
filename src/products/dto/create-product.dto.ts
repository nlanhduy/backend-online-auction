import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'Product name',
    minLength: 3,
    example: 'iPhone 15 Pro Max 256GB',
  })
  @IsString()
  @IsNotEmpty({ message: 'Product name must not be empty' })
  @MinLength(3, { message: 'Product name must be at least 3 characters long' })
  name: string;

  @ApiProperty({
    description:
      'Detailed product description (supports HTML from WYSIWYG editor)',
    example: '<p>Brand new product, 100% sealed...</p>',
  })
  @IsString()
  @IsNotEmpty({ message: 'Description must not be empty' })
  @MinLength(10, { message: 'Description must be at least 10 characters long' })
  description: string;

  @ApiProperty({
    description: 'List of product image URLs (minimum 3 images)',
    type: [String],
    minItems: 3,
    example: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
      'https://example.com/image3.jpg',
    ],
  })
  @IsArray()
  @ArrayMinSize(3, { message: 'At least 3 product images are required' })
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL' })
  images: string[];

  @ApiProperty({
    description: 'Starting price (VND)',
    minimum: 1000,
    example: 10000000,
  })
  @IsNumber()
  @Min(1000, { message: 'Starting price must be greater than 1,000 VND' })
  @Type(() => Number)
  initialPrice: number;

  @ApiProperty({
    description: 'Minimum bid increment for each auction step (VND)',
    minimum: 1000,
    example: 100000,
  })
  @IsNumber()
  @Min(1000, { message: 'Price step must be greater than 1,000 VND' })
  @Type(() => Number)
  priceStep: number;

  @ApiPropertyOptional({
    description:
      'Buy-now price (optional, must be greater than the starting price)',
    example: 25000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Type(() => Number)
  @ValidateIf((o) => o.buyNowPrice !== null && o.buyNowPrice !== undefined)
  buyNowPrice?: number;

  @ApiProperty({
    description: 'Auction start time (ISO 8601 format)',
    example: '2025-12-21T10:00:00Z',
  })
  @IsDateString({}, { message: 'Start time must be a valid ISO 8601 date' })
  startTime: string;

  @ApiProperty({
    description: 'Auction end time (ISO 8601 format)',
    example: '2025-12-31T23:59:59Z',
  })
  @IsDateString({}, { message: 'End time must be a valid ISO 8601 date' })
  endTime: string;

  @ApiProperty({
    description: 'Product category ID',
    example: 'clx123abc',
  })
  @IsString()
  @IsNotEmpty({ message: 'Category must not be empty' })
  categoryId: string;

  @ApiPropertyOptional({
    description:
      'Enable automatic auction extension if a bid is placed within the last X minutes',
    default: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'Auto extend must be a boolean value' })
  @Type(() => Boolean)
  autoExtend?: boolean;
}
