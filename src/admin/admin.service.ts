/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { PrismaService } from 'src/prisma/prisma.service';

import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus, ProductStatus, UpgradeStatus, UserRole } from '@prisma/client';

import { DateRangeDto } from './dto/date-range.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // Get dashboard statistics
  async getDashboardStats(dateRange?: DateRangeDto) {
    const startDate = dateRange?.startDate ? new Date(dateRange.startDate) : undefined;
    const endDate = dateRange?.endDate ? new Date(dateRange.endDate) : undefined;

    const dateFilter =
      startDate && endDate
        ? {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }
        : {};

    // Parallel queries for better performance
    const [
      revenueStats,
      userStats,
      productStats,
      bidStats,
      upgradeStats,
      topSellers,
      topBidders,
      revenueByDay,
      categoryStats,
    ] = await Promise.all([
      this.getRevenueStats(dateFilter),
      this.getUserStats(dateFilter),
      this.getProductStats(dateFilter),
      this.getBidStats(dateFilter),
      this.getUpgradeStats(dateFilter),
      this.getTopSellers(5),
      this.getTopBidders(5),
      this.getRevenueByDay(startDate, endDate),
      this.getCategoryStats(),
    ]);

    return {
      ...revenueStats,
      ...userStats,
      ...productStats,
      ...bidStats,
      upgradeRequests: upgradeStats,
      topSellers,
      topBidders,
      revenueByDay,
      categoryStats,
    };
  }

  // Revenue statistics
  private async getRevenueStats(dateFilter: any) {
    const orders = await this.prisma.order.findMany({
      where: {
        ...dateFilter,
        paymentStatus: PaymentStatus.COMPLETED,
      },
      select: {
        paymentAmount: true,
        platformFee: true,
      },
    });

    const totalRevenue =
      Math.round(orders.reduce((sum, order) => sum + (order.paymentAmount || 0), 0) * 100) / 100;
    const platformRevenue =
      Math.round(orders.reduce((sum, order) => sum + (order.platformFee || 0), 0) * 100) / 100;

    const [totalOrders, completedOrders] = await Promise.all([
      this.prisma.order.count({ where: dateFilter }),
      this.prisma.order.count({
        where: {
          ...dateFilter,
          status: PaymentStatus.COMPLETED,
        },
      }),
    ]);
    return {
      totalRevenue,
      platformRevenue,
      totalOrders,
      completedOrders,
    };
  }

  // User statistics
  private async getUserStats(dateFilter: any) {
    const [newUsers, totalUsers, newSellers, totalSellers] = await Promise.all([
      this.prisma.user.count({ where: dateFilter }),
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          ...dateFilter,
          role: UserRole.SELLER,
        },
      }),
      this.prisma.user.count({
        where: { role: UserRole.SELLER },
      }),
    ]);
    return {
      newUsers,
      totalUsers,
      newSellers,
      totalSellers,
    };
  }

  // Product statistics
  private async getProductStats(dateFilter: any) {
    const [newProducts, activeProducts, completedProducts] = await Promise.all([
      this.prisma.product.count({ where: dateFilter }),
      this.prisma.product.count({
        where: { status: ProductStatus.ACTIVE },
      }),
      this.prisma.product.count({
        where: {
          ...dateFilter,
          status: ProductStatus.COMPLETED,
        },
      }),
    ]);
    return {
      newProducts,
      activeProducts,
      completedProducts,
    };
  }

  // Bid statistics
  private async getBidStats(dateFilter: any) {
    const totalBids = await this.prisma.bid.count({ where: dateFilter });
    const totalProducts = await this.prisma.product.count({ where: dateFilter });
    const avgBidsPerProduct = totalProducts > 0 ? totalBids / totalProducts : 0;

    return {
      totalBids,
      avgBidsPerProduct: Math.round(avgBidsPerProduct * 100) / 100,
    };
  }

  // Upgrade request statistics
  private async getUpgradeStats(dateFilter: any) {
    const [pending, approved, rejected] = await Promise.all([
      this.prisma.sellerUpgradeRequest.count({
        where: {
          ...dateFilter,
          status: UpgradeStatus.PENDING,
        },
      }),
      this.prisma.sellerUpgradeRequest.count({
        where: {
          ...dateFilter,
          status: UpgradeStatus.APPROVED,
        },
      }),
      this.prisma.sellerUpgradeRequest.count({
        where: {
          ...dateFilter,
          status: UpgradeStatus.REJECTED,
        },
      }),
    ]);

    return { pending, approved, rejected };
  }

  // Top sellers by revenue
  private async getTopSellers(limit: number = 5) {
    const sellers = await this.prisma.user.findMany({
      where: { role: UserRole.SELLER },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatar: true,
        Order_Order_sellerIdToUser: {
          where: {
            status: OrderStatus.COMPLETED,
            paymentStatus: PaymentStatus.COMPLETED,
          },
          select: {
            sellerAmount: true,
          },
        },
        products: {
          where: {
            status: ProductStatus.COMPLETED,
          },
          select: {
            id: true,
          },
        },
      },
      take: 100, // Get more to sort in memory
    });
    return sellers
      .map((seller) => ({
        id: seller.id,
        fullName: seller.fullName,
        email: seller.email,
        avatar: seller.avatar,
        totalSales: seller.Order_Order_sellerIdToUser.length,
        revenue:
          Math.round(
            seller.Order_Order_sellerIdToUser.reduce((sum, o) => sum + (o.sellerAmount || 0), 0) *
              100,
          ) / 100,
        productCount: seller.products.length,
      }))
      .filter((seller) => seller.totalSales > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  // Top bidders by spending
  private async getTopBidders(limit: number = 5) {
    const bidders = await this.prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.BIDDER, UserRole.SELLER],
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatar: true,
        bids: {
          select: {
            id: true,
            amount: true,
          },
        },
        Order_Order_buyerIdToUser: {
          where: {
            status: OrderStatus.COMPLETED,
            paymentStatus: PaymentStatus.COMPLETED,
          },
          select: {
            paymentAmount: true,
          },
        },
      },
      take: 100,
    });
    return bidders
      .map((bidder) => ({
        id: bidder.id,
        fullName: bidder.fullName,
        email: bidder.email,
        avatar: bidder.avatar,
        totalBids: bidder.bids.length,
        wonAuctions: bidder.Order_Order_buyerIdToUser.length,
        totalSpent:
          Math.round(
            bidder.Order_Order_buyerIdToUser.reduce((sum, o) => sum + (o.paymentAmount || 0), 0) *
              100,
          ) / 100,
      }))
      .filter((bidder) => bidder.totalBids > 0)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);
  }

  // Revenue by day
  private async getRevenueByDay(startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
        paymentStatus: PaymentStatus.COMPLETED,
        status: OrderStatus.COMPLETED,
      },
      select: {
        createdAt: true,
        paymentAmount: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    // Group by date
    const revenueMap = new Map<string, { revenue: number; count: number }>();

    orders.forEach((order) => {
      const date = order.createdAt.toISOString().split('T')[0];
      const current = revenueMap.get(date) || { revenue: 0, count: 0 };
      revenueMap.set(date, {
        revenue: current.revenue + (order.paymentAmount || 0),
        count: current.count + 1,
      });
    });

    return Array.from(revenueMap.entries()).map(([date, data]) => ({
      date,
      revenue: Math.round(data.revenue * 100) / 100,
      orderCount: data.count,
    }));
  }

  // Category statistics
  private async getCategoryStats() {
    const categories = await this.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        products: {
          where: {
            status: ProductStatus.COMPLETED,
          },
          select: {
            id: true,
            Order: {
              where: {
                status: OrderStatus.COMPLETED,
                paymentStatus: PaymentStatus.COMPLETED,
              },
              select: {
                paymentAmount: true,
              },
            },
          },
        },
      },
    });
    return categories
      .map((cat) => ({
        category: cat.name,
        productCount: cat.products.length,
        totalRevenue: cat.products.reduce(
          (sum, p) =>
            sum +
            (Array.isArray(p.Order)
              ? p.Order.reduce((orderSum, o) => orderSum + (o.paymentAmount ?? 0), 0)
              : (p.Order?.paymentAmount ?? 0)),
          0,
        ),
      }))
      .filter((stat) => stat.productCount > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  // Get user growth overtime
  async getUserGrowth(dateRange?: DateRangeDto) {
    let startDate: Date;
    let endDate: Date;

    // Use provided dateRange or default to last 30 days
    if (dateRange?.startDate && dateRange?.endDate) {
      startDate = new Date(dateRange.startDate);
      endDate = new Date(dateRange.endDate);
    } else if (dateRange?.startDate) {
      startDate = new Date(dateRange.startDate);
      endDate = new Date();
    } else {
      // Default: last 30 days
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      endDate = new Date();
    }

    // Fill all dates in range (including dates with no data)
    const result: Array<{ date: string; bidders: number; sellers: number; total: number }> = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];

      // Count total users up to this date
      const [totalBidders, totalSellers] = await Promise.all([
        this.prisma.user.count({
          where: {
            role: UserRole.BIDDER,
            createdAt: { lte: currentDate },
          },
        }),
        this.prisma.user.count({
          where: {
            role: UserRole.SELLER,
            createdAt: { lte: currentDate },
          },
        }),
      ]);

      result.push({
        date: dateStr,
        bidders: totalBidders,
        sellers: totalSellers,
        total: totalBidders + totalSellers,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return result;
  }

  // Get auction complete rate
  async getAuctionStats() {
    const [total, completed, withWinner, cancelled] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({
        where: { status: ProductStatus.COMPLETED },
      }),
      this.prisma.product.count({
        where: {
          status: ProductStatus.COMPLETED,
          winnerId: { not: null },
        },
      }),
      this.prisma.product.count({
        where: { status: ProductStatus.CANCELED },
      }),
    ]);
    return {
      total,
      completed,
      withWinner,
      cancelled,
      completionRate: total > 0 ? Math.round((completed / total) * 10000) / 100 : 0,
      successRate: completed > 0 ? Math.round((withWinner / completed) * 10000) / 100 : 0,
    };
  }
}
