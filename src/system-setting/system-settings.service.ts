import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

@Injectable()
export class SystemSettingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Lấy cấu hình hiện tại (hoặc tạo mới nếu chưa có)
   */
  async getSettings() {
    let settings = await this.prisma.systemSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    // Nếu chưa có settings, tạo mới với giá trị mặc định
    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: {
          autoExtendThresholdMinutes: 5,
          extensionDuration: 10,
          maxExtensions: 3,
          minImages: 3,
        },
      });
    }

    return settings;
  }

  /**
   * Cập nhật cấu hình (chỉ ADMIN)
   */
  async updateSettings(dto: UpdateSystemSettingsDto, adminId: string) {
    const settings = await this.getSettings();

    return this.prisma.systemSettings.update({
      where: { id: settings.id },
      data: {
        ...dto,
        updatedBy: adminId,
      },
    });
  }

  /**
   * Kiểm tra xem product có nên được gia hạn không
   */
  async checkAutoExtension(
    productId: string,
    bidTime: Date,
  ): Promise<{
    shouldExtend: boolean;
    newEndTime?: Date;
    reason?: string;
  }> {
    const settings = await this.getSettings();

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        autoExtend: true,
        endTime: true,
        extendedCount: true,
        status: true,
      },
    });

    if (!product) {
      return { shouldExtend: false, reason: 'Product not found' };
    }

    // Kiểm tra: có bật auto-extend không?
    if (!product.autoExtend) {
      return { shouldExtend: false, reason: 'Auto-extend disabled' };
    }

    // Kiểm tra: product phải ACTIVE
    if (product.status !== 'ACTIVE') {
      return { shouldExtend: false, reason: 'Product not active' };
    }

    // Kiểm tra: đã vượt quá số lần gia hạn chưa?
    if (settings.maxExtensions && product.extendedCount >= settings.maxExtensions) {
      return {
        shouldExtend: false,
        reason: `Max extensions (${settings.maxExtensions}) reached`,
      };
    }

    // Kiểm tra: bid có trong khoảng threshold không?
    const timeUntilEnd = product.endTime.getTime() - bidTime.getTime();
    const thresholdMs = settings.autoExtendThresholdMinutes * 60 * 1000;

    if (timeUntilEnd > thresholdMs) {
      return {
        shouldExtend: false,
        reason: `Bid not within ${settings.autoExtendThresholdMinutes} min threshold`,
      };
    }

    // Tính endTime mới
    const extensionMs = settings.extensionDuration * 60 * 1000;
    const newEndTime = new Date(product.endTime.getTime() + extensionMs);

    return {
      shouldExtend: true,
      newEndTime,
      reason: `Extended by ${settings.extensionDuration} minutes`,
    };
  }

  /**
   * Thực hiện gia hạn product
   */
  async extendProduct(productId: string, newEndTime: Date) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { originalEndTime: true, endTime: true },
    });

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        endTime: newEndTime,
        extendedCount: { increment: 1 },
        // Lưu originalEndTime nếu đây là lần gia hạn đầu tiên
        originalEndTime: product?.originalEndTime || product?.endTime,
      },
    });
  }
}