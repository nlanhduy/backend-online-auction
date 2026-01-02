import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Email address of the user.',
    example: 'example@gmail.com',
  })
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  @ApiProperty({
    description:
      'Password must be at least 8 characters and include uppercase, lowercase letters and a number.',
    example: 'Password123',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @ApiProperty({
    description: 'Full name of the user.',
    example: 'John Doe',
  })
  fullName: string;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Date of birth of the user (YYYY-MM-DD).',
    example: '1995-08-20',
  })
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  @MinLength(10)
  @ApiPropertyOptional({
    description: 'Address of the user.',
    example: '123 Main St, Ho Chi Minh City, Vietnam',
  })
  address?: string;

  @IsEnum(UserRole)
  @IsNotEmpty()
  @ApiProperty({
    description: 'Role of the user.',
    enum: UserRole,
    example: UserRole.BIDDER,
  })
  role: UserRole;
}
