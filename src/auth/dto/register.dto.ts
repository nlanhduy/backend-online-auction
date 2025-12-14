import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'Email address',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Password (minimum 6 characters)',
    example: 'password123',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({
    description: 'Date of birth (ISO format)',
    example: '1990-01-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({
    description: 'Address',
    example: '123 Main St, City, Country',
    required: false,
  })
  @IsOptional()
  @IsString()
  address: string;

  @ApiProperty({
    description: 'reCAPTCHA v2 token',
    example: '03AGdBq26...',
  })
  @IsString()
  @IsNotEmpty()
  recaptchaToken: string;
}
