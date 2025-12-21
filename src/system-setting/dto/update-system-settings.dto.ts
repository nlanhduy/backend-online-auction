import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateSystemSettingsDto {
  @ApiPropertyOptional({
    description: 'Auto-extension trigger time (in minutes). A bid placed within the last X minutes will extend the auction.',
    minimum: 1,
    example: 5,
  })
  @IsOptional()
  @IsInt({ message: 'autoExtendThresholdMinutes must be an integer' })
  @Min(1, { message: 'autoExtendThresholdMinutes must be greater than 0' })
  @Type(() => Number)
  autoExtendThresholdMinutes?: number;

  @ApiPropertyOptional({
    description: 'Extension duration (in minutes)',
    minimum: 1,
    example: 10,
  })
  @IsOptional()
  @IsInt({ message: 'extensionDuration must be an integer' })
  @Min(1, { message: 'extensionDuration must be greater than 0' })
  @Type(() => Number)
  extensionDuration?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of extensions (null = unlimited)',
    minimum: 1,
    example: 3,
    nullable: true,
  })
  @IsOptional()
  @IsInt({ message: 'maxExtensions must be an integer' })
  @Min(1, { message: 'maxExtensions must be greater than 0' })
  @Type(() => Number)
  maxExtensions?: number | null;

  @ApiPropertyOptional({
    description: 'Minimum number of images per product',
    minimum: 1,
    example: 3,
  })
  @IsOptional()
  @IsInt({ message: 'minImages must be an integer' })
  @Min(1, { message: 'minImages must be greater than 0' })
  @Type(() => Number)
  minImages?: number;
}
