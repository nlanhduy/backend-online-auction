/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
    summary: 'Get current system settings (Public)',
    description:
      'Returns system parameters: autoExtendThresholdMinutes, extensionDuration, maxExtensions, minImages',
  })
  @ApiResponse({ status: 200, description: 'Settings retrieved successfully' })
  getSettings() {
    return this.systemSettingsService.getSettings();
  }

  @Patch()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system settings (ADMIN only)',
    description:
      'Adjust auto-extension timing and minimum image requirements. Applied globally to all products.',
  })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  @ApiResponse({ status: 403, description: 'Only ADMIN can update settings' })
  updateSettings(@Body() updateDto: UpdateSystemSettingsDto, @CurrentUser() user: any) {
    return this.systemSettingsService.updateSettings(updateDto, user.sub);
  }
}
