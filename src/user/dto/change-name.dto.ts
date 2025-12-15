import { IsString, MinLength } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class ChangeNameDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  fullName: string;
}
