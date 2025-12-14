/* eslint-disable prettier/prettier */
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The email address of the user. Must be a valid email format.',
    example: 'example@gmail.com',
  })
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @ApiProperty({
    description: 'Password of the user. Minimum length is 6 characters.',
    example: 'P@ssw0rd123',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Full name of the user.',
    example: 'John Doe',
  })
  fullName: string;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Date of birth of the user. Optional field.',
    example: '1990-01-01',
  })
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Address of the user. Optional field.',
    example: '123 Main St, City, Country',
  })
  address?: string;

  @IsEnum(UserRole)
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Role of the user. Optional field. Possible values: USER, ADMIN, MODERATOR.',
    enum: UserRole,
    example: UserRole.BIDDER,
  })
  role?: UserRole;
}
