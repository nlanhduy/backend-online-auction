import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePaypalEmailDto {
  @ApiProperty({ 
    example: 'seller@paypal.com',
    description: 'PayPal email to receive payouts' 
  })
  @IsEmail()
  @IsNotEmpty()
  paypalEmail: string;
}
