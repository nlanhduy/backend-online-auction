import { IsDateString, IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Email address of the user',
    example: 'example@gmail.com',
  })
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @ApiProperty({
    description: 'Password of the user, minimum 6 characters',
    example: 'P@ssw0rd123',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  fullName: string;

  @IsDateString()
  @ApiProperty({
    description: 'Date of birth of the user',
    example: '1990-01-01',
  })
  dateOfBirth: string;

  @IsString()
  @ApiProperty({
    description: 'Address of the user',
    example: '123 Main St, City, Country',
  })
  address: string;
}
