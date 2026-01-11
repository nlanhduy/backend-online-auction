import { IsDateString, IsOptional } from 'class-validator';

export class DateRangeDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class DashboardStatsDto {
  totalRevenue: number;
  platformRevenue: number;
  totalOrders: number;

  newUsers: number;
  totalUsers: number;
  newSellers: number;
  totalSellers: number;

  newProducts: number;
  activeProducts: number;
  completedProducts: number;

  totalBids: number;
  avgBidsPerProduct: number;

  upgradeRequests: {
    pending: number;
    approved: number;
    rejected: number;
  };

  topSellers: Array<{
    id: string;
    fullName: string;
    email: string;
    totalSales: number;
    revenue: number;
    productCount: number;
  }>;

  topBidders: Array<{
    id: string;
    fullName: string;
    email: string;
    totalBids: number;
    wonAuctions: number;
    totalSpent: number;
  }>;

  revenueByDay?: Array<{
    date: string;
    revenue: number;
    orderCount: number;
  }>;

  categoryStats?: Array<{
    category: string;
    productCount: number;
    totalRevenue: number;
  }>;
}
