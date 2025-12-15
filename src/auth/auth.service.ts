/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */

import axios from 'axios';
import * as bcrypt from 'bcrypt';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';

import { MailService } from '../mail/mail.service';
import { OtpService } from '../otp/otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterVerifyDto } from './dto/register-verify.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly otpService: OtpService,
  ) {}

  /**
   * Request registration - verify reCAPTCHA and send OTP
   */
  async requestRegister(registerDto: RegisterDto): Promise<{ message: string }> {
    const { email, recaptchaToken } = registerDto;

    // Verify reCAPTCHA v2
    const isRecaptchaValid = await this.verifyRecaptcha(recaptchaToken);
    if (!isRecaptchaValid) {
      throw new BadRequestException('reCAPTCHA verification failed');
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Generate OTP
    const otp = this.otpService.generateOtp();

    // Store OTP and registration data in cache
    // We'll use a composite key to store both OTP and registration data
    await this.otpService.storeRegistrationData(email, otp, registerDto);

    // Send OTP via email
    await this.mailService.sendRegistrationOtp(email, otp);

    return {
      message: 'Verification code sent to your email address',
    };
  }

  /**
   * Verify OTP and complete registration
   */
  async verifyAndRegister(registerVerifyDto: RegisterVerifyDto) {
    const { email, otp } = registerVerifyDto;

    // Verify OTP and get stored registration data
    const registrationData = await this.otpService.verifyRegistrationOtp(email, otp);

    if (!registrationData) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Double-check email availability before creating user
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Clear OTP as it's no longer valid
      this.otpService.clearRegistrationData(email);
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await this.hashPassword(registrationData.password);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName: registrationData.fullName,
        dateOfBirth: registrationData.dateOfBirth ? new Date(registrationData.dateOfBirth) : null,
        role: UserRole.BIDDER,
        address: registrationData.address,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Save refresh token
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    // Clear OTP after successful registration (one-time use)
    this.otpService.clearRegistrationData(email);

    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      ...tokens,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.verifyPassword(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    await this.saveRefreshToken(user.id, tokens.refreshToken);

    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      ...tokens,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const refreshTokenRecord = await this.prisma.refreshToken.findFirst({
      where: {
        userId: user.id,
        token: refreshToken,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!refreshTokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.delete({
      where: { id: refreshTokenRecord.id },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    return { message: 'Logged out successfully' };
  }

  /**
   * Verify reCAPTCHA v2 token
   */
  private async verifyRecaptcha(recaptchaToken: string): Promise<boolean> {
    if (!recaptchaToken) {
      return false;
    }

    const secretKey = this.configService.get<string>('RECAPTCHA_SECRET_KEY');
    console.log(secretKey);
    if (!secretKey) {
      throw new Error('RECAPTCHA_SECRET_KEY is not configured');
    }

    try {
      const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
        params: {
          secret: secretKey,
          response: recaptchaToken,
        },
      });
      console.log({ response });

      return response.data.success === true;
    } catch (error) {
      console.error('reCAPTCHA verification error:', error);
      return false;
    }
  }

  private async generateTokens(userId: string, email: string, role: UserRole) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        {
          sub: userId,
          email,
          role,
        },
        {
          secret: this.configService.get('JWT_SECRET'),
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        {
          sub: userId,
          email,
          role,
        },
        {
          secret: this.configService.get('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async saveRefreshToken(userId: string, refreshToken: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt,
      },
    });
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  private async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
