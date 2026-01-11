import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { DateRangeDto } from './dto/date-range.dto';

@ApiTags('Admin Dashboard')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  @ApiOperation({
    summary: 'Get comprehensive dashboard statistics',
    description:
      'Returns revenue, orders, users, products, bids, top sellers/bidders, revenue by day, and category statistics. Supports optional date range filtering.',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date in ISO format (YYYY-MM-DD)',
    example: '2025-12-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date in ISO format (YYYY-MM-DD)',
    example: '2026-01-02',
  })
  @ApiResponse({ status: 200, description: 'Dashboard statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getDashboardStats(@Query() dateRange: DateRangeDto) {
    return this.adminService.getDashboardStats(dateRange);
  }

  @Get('dashboard/user-growth')
  @ApiOperation({
    summary: 'Get user growth over time',
    description:
      'Returns cumulative count of bidders and sellers for each day in the specified date range. Shows total users accumulated up to each date.',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date in ISO format (YYYY-MM-DD). Defaults to 30 days ago if not provided',
    example: '2025-12-23',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date in ISO format (YYYY-MM-DD). Defaults to today if not provided',
    example: '2026-01-02',
  })
  @ApiResponse({ status: 200, description: 'User growth data retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getUserGrowth(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    const dateRange = startDate || endDate ? { startDate, endDate } : undefined;
    return this.adminService.getUserGrowth(dateRange);
  }

  @Get('dashboard/auction-stats')
  @ApiOperation({
    summary: 'Get auction completion statistics',
    description:
      'Returns overall auction statistics including total auctions, completed, with winner, cancelled, completion rate, and success rate.',
  })
  @ApiResponse({ status: 200, description: 'Auction statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getAuctionStats() {
    return this.adminService.getAuctionStats();
  }
}
