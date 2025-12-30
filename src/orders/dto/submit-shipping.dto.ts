import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitShippingDto {
  @ApiProperty({ example: '123 Nguyen Van Linh St.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiProperty({ example: 'Ho Chi Minh City' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'District 7' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  district: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiProperty({ example: 'Please call before delivery', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}