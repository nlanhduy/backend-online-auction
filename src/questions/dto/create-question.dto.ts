import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQuestionDto {
  @ApiProperty({
    description: 'The ID of the product being discussed',
    example: 'pro-016',
  })
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'Content of the question or reply',
    example: 'Is this item authentic?',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    description:
      'ID of the parent question/comment if this is a reply. Leave empty for a new root question.',
    example: 'null (for root) or uuid (for reply)',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
