import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/currentUser.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SystemSettingsService } from './system-settings.service';

@ApiTags('system-settings')
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Lấy cấu hình hệ thống hiện tại (Public)',
    description:
      'Trả về các tham số: autoExtendThresholdMinutes, extensionDuration, maxExtensions, minImages',
  })
  @ApiResponse({ status: 200, description: 'Settings retrieved successfully' })
  getSettings() {
    return this.systemSettingsService.getSettings();
  }

  @Patch()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cập nhật cấu hình hệ thống (ADMIN only)',
    description:
      'Điều chỉnh thời gian auto-extension, số ảnh tối thiểu. Áp dụng cho tất cả sản phẩm.',
  })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  @ApiResponse({ status: 403, description: 'Only ADMIN can update settings' })
  updateSettings(
    @Body() updateDto: UpdateSystemSettingsDto,
    @CurrentUser() user: any,
  ) {
    return this.systemSettingsService.updateSettings(updateDto, user.sub);
  }
}