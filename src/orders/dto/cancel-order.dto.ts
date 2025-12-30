import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelOrderDto {
  @ApiProperty({ 
    example: 'Buyer did not pay within 24 hours',
    description: 'Reason for cancellation' 
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}