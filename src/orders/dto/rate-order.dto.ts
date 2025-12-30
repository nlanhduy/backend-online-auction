import { IsInt, IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RateOrderDto {
  @ApiProperty({ example: 1, description: '1 for positive, -1 for negative' })
  @IsInt()
  @IsIn([1, -1], { message: 'Rating value must be either 1 (positive) or -1 (negative)' })
  value: number;

  @ApiProperty({ 
    example: 'Great buyer, fast payment!',
    required: false,
    description: 'Optional comment'
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  comment?: string;
}