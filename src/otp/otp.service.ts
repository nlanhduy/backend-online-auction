import * as bcrypt from 'bcrypt';

import { Injectable } from '@nestjs/common';

import { RegisterDto } from '../auth/dto/register.dto';

interface OtpData {
  hashedOtp: string;
  userId: string;
  expiresAt: number;
}

interface RegistrationOtpData {
  hashedOtp: string;
  expiresAt: number;
  registrationData: {
    password: string;
    fullName: string;
    dateOfBirth?: string;
    address: string;
  };
}

@Injectable()
export class OtpService {
  private readonly otpCache = new Map<string, OtpData>();
  private readonly registrationCache = new Map<string, RegistrationOtpData>();
  private readonly OTP_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly SALT_ROUNDS = 10;

  /**
   * Generate a 6-digit OTP
   */
  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Store OTP for email change (with userId)
   */
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

  /**
   * Store registration data with OTP
   */
  async storeRegistrationData(email: string, otp: string, registerDto: RegisterDto): Promise<void> {
    const hashedOtp = await bcrypt.hash(otp, this.SALT_ROUNDS);
    const expiresAt = Date.now() + this.OTP_TTL;

    this.registrationCache.set(email, {
      hashedOtp,
      expiresAt,
      registrationData: {
        password: registerDto.password,
        fullName: registerDto.fullName,
        dateOfBirth: registerDto.dateOfBirth,
        address: registerDto.address,
      },
    });

    // Auto-cleanup expired OTP
    setTimeout(() => {
      this.registrationCache.delete(email);
    }, this.OTP_TTL);
  }

  /**
   * Verify OTP for email change and return userId
   */
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

  /**
   * Verify OTP for registration and return registration data
   */
  async verifyRegistrationOtp(
    email: string,
    otp: string,
  ): Promise<RegistrationOtpData['registrationData'] | null> {
    const data = this.registrationCache.get(email);

    if (!data) {
      return null; // OTP not found
    }

    if (Date.now() > data.expiresAt) {
      this.registrationCache.delete(email);
      return null;
    }

    // Verify OTP hash
    const isValid = await bcrypt.compare(otp, data.hashedOtp);

    if (!isValid) {
      return null;
    }

    return data.registrationData;
  }

  /**
   * Clear OTP for email change
   */
  clearOtp(email: string): void {
    this.otpCache.delete(email);
  }

  /**
   * Clear registration data
   */
  clearRegistrationData(email: string): void {
    this.registrationCache.delete(email);
  }

  /**
   * Check if OTP exists and is valid (for email change)
   */
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

  /**
   * Check if registration OTP exists and is valid
   */
  hasRegistrationOtp(email: string): boolean {
    const data = this.registrationCache.get(email);
    if (!data) return false;

    // Check if expired
    if (Date.now() > data.expiresAt) {
      this.registrationCache.delete(email);
      return false;
    }

    return true;
  }
}
