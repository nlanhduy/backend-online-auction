/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
import express from 'express';

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { RequestSellerUpgradeDto } from './dto/request-seller-upgrade.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './user.service';

@ApiTags('Admin - Users')
@ApiBearerAuth('access-token')
@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User successfully created.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  @ApiBody({ type: CreateUserDto })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'List of users retrieved.' })
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get profile of the current user' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  getProfile(@Req() req: express.Request) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const userId = req.user['sub'];
    return this.usersService.findOne(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', example: '123' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden (cannot update role).' })
  @ApiBody({ type: UpdateUserDto })
  updateProfile(@Req() req: express.Request, @Body() updateUserDto: UpdateUserDto) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const userId = req.user['sub'];

    if (updateUserDto.role) {
      throw new ForbiddenException('Cannot update own role');
    }

    return this.usersService.update(userId, updateUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', example: '123' })
  @ApiResponse({ status: 200, description: 'User updated successfully.' })
  @ApiBody({ type: UpdateUserDto })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile/password')
  @ApiOperation({ summary: 'Update password of current user' })
  @ApiBody({ type: UpdatePasswordDto })
  @ApiResponse({ status: 200, description: 'Password updated successfully.' })
  updatePassword(@Req() req: express.Request, @Body() updatePasswordDto: UpdatePasswordDto) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const userId = req.user['sub'];
    return this.usersService.updatePassword(userId, updatePasswordDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', example: '123' })
  @ApiResponse({ status: 200, description: 'User deleted successfully.' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request-seller-upgrade')
  @ApiOperation({ summary: 'Request seller upgrade for current user' })
  @ApiBody({ type: RequestSellerUpgradeDto })
  @ApiResponse({ status: 200, description: 'Request submitted successfully.' })
  requestSellerUpgrade(@Req() req: express.Request, @Body() requestDto: RequestSellerUpgradeDto) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const userId = req.user['sub'];
    return this.usersService.requestSellerUpgrade(userId, requestDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('seller-upgrade-requests/pending')
  @ApiOperation({ summary: 'Get all pending seller upgrade requests' })
  @ApiResponse({ status: 200, description: 'List of pending requests retrieved.' })
  getPendingSellerUpgradeRequests() {
    return this.usersService.getPendingSellerUpgradeRequests();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('seller-upgrade-requests/:id/approve')
  @ApiOperation({ summary: 'Approve seller upgrade request by ID' })
  @ApiParam({ name: 'id', description: 'Request ID', example: '123' })
  @ApiResponse({ status: 200, description: 'Request approved.' })
  approveSellerUpgrade(@Param('id') id: string) {
    return this.usersService.approveSellerUpgrade(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('seller-upgrade-requests/:id/reject')
  @ApiOperation({ summary: 'Reject seller upgrade request by ID' })
  @ApiParam({ name: 'id', description: 'Request ID', example: '123' })
  @ApiResponse({ status: 200, description: 'Request rejected.' })
  rejectSellerUpgrade(@Param('id') id: string) {
    return this.usersService.rejectSellerUpgrade(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/rating')
  @ApiOperation({ summary: 'Get rating of a user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', example: '123' })
  @ApiResponse({ status: 200, description: 'User rating retrieved successfully.' })
  getUserRating(@Param('id') id: string) {
    return this.usersService.getUserRating(id);
  }
}
