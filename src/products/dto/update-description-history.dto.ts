import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class UpdateDescriptionHistoryDto {
  @ApiProperty({ 
    description: 'Updated description content',
    example: 'Corrected: iPhone 15 Pro Max 256GB'
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ 
    description: 'Reason for updating history entry',
    example: 'Fixed typo',
    required: false
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
