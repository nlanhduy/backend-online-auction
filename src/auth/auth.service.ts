/* eslint-disable @typescript-eslint/no-unused-vars */

import * as bcrypt from 'bcrypt';

import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, fullName, dateOfBirth, address } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await this.hashPassword(password);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        role: UserRole.GUEST,
        address: address,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    await this.saveRefreshToken(user.id, tokens.refreshToken);

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
