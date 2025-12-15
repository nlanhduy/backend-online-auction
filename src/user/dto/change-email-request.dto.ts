import { IsEmail } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class ChangeEmailRequestDto {
  @ApiProperty({
    example: 'new@email.com',
    description: 'The new email address to change to',
  })
  @IsEmail()
  newEmail: string;
}
