/* eslint-disable @typescript-eslint/no-unused-vars */
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';

import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Remove password from user object
    const { password, ...result } = user;
    return result;
  }
}

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }
    const refreshToken = authHeader.replace('Bearer', '').trim();

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        userId: payload.sub,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      ...payload,
      refreshToken,
    };
  }
}
