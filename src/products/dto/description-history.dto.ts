import { ApiProperty } from '@nestjs/swagger';

export class DescriptionHistoryDto {
  @ApiProperty({ 
    description: 'History entry ID',
    example: 'uuid-123'
  })
  id: string;

  @ApiProperty({ 
    description: 'Description content',
    example: 'Sản phẩm iPhone 15 Pro Max mới 100%'
  })
  description: string;

  @ApiProperty({ 
    description: 'When this description was created',
    example: '2025-12-26T10:30:00.000Z'
  })
  createdAt: Date;

  @ApiProperty({ 
    description: 'Who created this description change',
    example: 'user-uuid',
    required: false
  })
  createdBy?: string;
}

export class DescriptionHistoryResponseDto {
  @ApiProperty({ 
    description: 'Product ID',
    example: 'product-uuid'
  })
  productId: string;

  @ApiProperty({ 
    description: 'Current description',
    example: 'Latest description'
  })
  currentDescription: string;

  @ApiProperty({ 
    type: [DescriptionHistoryDto],
    description: 'List of all description changes ordered by newest first'
  })
  history: DescriptionHistoryDto[];

  @ApiProperty({ 
    description: 'Total number of changes',
    example: 5
  })
  totalChanges: number;
}
