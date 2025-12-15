import { IsEmail, IsString, Length } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class ChangeEmailVerifyDto {
  @ApiProperty({
    example: 'new@email.com',
    description: 'The new email address to be verified',
  })
  @IsEmail()
  newEmail: string;

  @ApiProperty({
    example: '123456',
    description: 'The 6-digit OTP code sent to the new email',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6)
  otp: string;
}
