import { ApiProperty } from '@nestjs/swagger';

export class ChangeEmailResponseDto {
  @ApiProperty({
    example: 'Email changed successfully',
    description: 'Success message',
  })
  message: string;
}
