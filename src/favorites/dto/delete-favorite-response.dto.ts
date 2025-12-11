import { ApiProperty } from '@nestjs/swagger';

export class DeleteFavoriteResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Product removed from favorites successfully',
  })
  message: string;
}
