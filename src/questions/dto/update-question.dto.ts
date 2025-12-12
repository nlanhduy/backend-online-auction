import { IsNotEmpty, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class UpdateQuestionDto {
  @ApiProperty({
    description: 'Updated question/reply content',
    example: 'Does this product support wireless charging?',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}
