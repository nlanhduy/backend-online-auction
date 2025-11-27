import { IsOptional, IsString } from 'class-validator';

export class RequestSellerUpgradeDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
