import * as bcrypt from 'bcrypt';

// src/otp/otp.service.ts
import { Injectable } from '@nestjs/common';

interface OtpData {
  hashedOtp: string;
  userId: string;
  expiresAt: number;
}

@Injectable()
export class OtpService {
  private readonly otpCache = new Map<string, OtpData>();
  private readonly OTP_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly SALT_ROUNDS = 10;

  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async storeOtp(email: string, otp: string, userId: string): Promise<void> {
    const hashedOtp = await bcrypt.hash(otp, this.SALT_ROUNDS);
    const expiresAt = Date.now() + this.OTP_TTL;

    this.otpCache.set(email, {
      hashedOtp,
      userId,
      expiresAt,
    });

    // Auto-cleanup expired OTP
    setTimeout(() => {
      this.otpCache.delete(email);
    }, this.OTP_TTL);
  }

  async verifyOtp(email: string, otp: string): Promise<string | null> {
    const data = this.otpCache.get(email);

    if (!data) {
      return null; // OTP not found
    }

    if (Date.now() > data.expiresAt) {
      this.otpCache.delete(email);
      return null;
    }

    // Verify OTP hash
    const isValid = await bcrypt.compare(otp, data.hashedOtp);

    if (!isValid) {
      return null;
    }

    return data.userId;
  }

  clearOtp(email: string): void {
    this.otpCache.delete(email);
  }

  hasOtp(email: string): boolean {
    const data = this.otpCache.get(email);
    if (!data) return false;

    // Check if expired
    if (Date.now() > data.expiresAt) {
      this.otpCache.delete(email);
      return false;
    }

    return true;
  }
}
