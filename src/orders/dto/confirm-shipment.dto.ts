import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmShipmentDto {
  @ApiProperty({ example: 'VN123456789' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trackingNumber: string;

  @ApiProperty({ example: 'Giao Hang Nhanh', description: 'Shipping carrier name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  carrier: string;
}