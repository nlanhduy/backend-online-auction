/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import express from 'express';
import { Public } from 'src/common/decorators/public.decorator';

import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterVerifyDto } from './dto/register-verify.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register/request')
  @ApiOperation({ summary: 'Request registration - sends OTP to email' })
  @ApiResponse({ status: 200, description: 'OTP sent to email successfully.' })
  @ApiResponse({ status: 409, description: 'Email already exists.' })
  @ApiBody({ type: RegisterDto })
  async registerRequest(@Body() registerDto: RegisterDto) {
    return await this.authService.requestRegister(registerDto);
  }

  @Public()
  @Post('register/verify')
  @ApiOperation({ summary: 'Verify OTP and complete registration' })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP.' })
  @ApiBody({ type: RegisterVerifyDto })
  async registerVerify(
    @Body() registerVerifyDto: RegisterVerifyDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const tokens = await this.authService.verifyAndRegister(registerVerifyDto);

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: false, // true in production with HTTPS
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/auth/refresh',
    });

    const { refreshToken, ...rest } = tokens;
    return rest;
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login user and get access token' })
  @ApiResponse({ status: 200, description: 'User logged in successfully.' })
  @ApiBody({ type: LoginDto })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: express.Response) {
    const tokens = await this.authService.login(loginDto);

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh',
    });

    const { refreshToken, ...rest } = tokens;
    return rest;
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  async refreshTokens(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    if (!req.user) throw new UnauthorizedException();

    const userId = req.user['sub'];
    const refreshToken = req.user['refreshToken'];

    const tokens = await this.authService.refreshTokens(userId, refreshToken);

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    const { refreshToken: _, ...rest } = tokens;
    return rest;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Logout current user' })
  @ApiResponse({ status: 200, description: 'User logged out successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBearerAuth('access-token')
  async logout(@Req() req: express.Request, @Res({ passthrough: true }) res: express.Response) {
    if (!req.user) throw new UnauthorizedException();

    const userId = req.user['sub'];
    await this.authService.logout(userId);

    // Clear refresh token cookie
    res.clearCookie('refresh_token', { path: '/auth/refresh' });

    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get profile of current user' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBearerAuth('access-token')
  getProfile(@Req() req: express.Request) {
    return req.user;
  }
}
