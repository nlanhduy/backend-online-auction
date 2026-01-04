import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
