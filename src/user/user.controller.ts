/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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

import { Roles } from '../common/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { RequestSellerUpgradeDto } from './dto/request-seller-upgrade.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './user.service';
import { CurrentUser } from 'src/common/decorators/currentUser.decorator';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ==================== Current User Routes ====================
  
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  getCurrentUser(@CurrentUser() user: any) {
    return this.usersService.findOne(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 403, description: 'Cannot update own role' })
  @ApiBody({ type: UpdateUserDto })
  updateCurrentUser(
    @CurrentUser() user: any,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    // Prevent users from updating their own role
    if (updateUserDto.role) {
      throw new ForbiddenException('Cannot update own role');
    }
    return this.usersService.update(user.sub, updateUserDto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password for current user' })
  @ApiResponse({ status: 200, description: 'Password updated successfully' })
  @ApiResponse({ status: 400, description: 'Current password is incorrect' })
  @ApiBody({ type: UpdatePasswordDto })
  updatePassword(
    @CurrentUser() user: any,
    @Body() updatePasswordDto: UpdatePasswordDto,
  ) {
    return this.usersService.updatePassword(user.sub, updatePasswordDto);
  }

  @Get('me/rating')
  @ApiOperation({ summary: 'Get current user rating statistics' })
  @ApiResponse({ status: 200, description: 'Rating retrieved successfully' })
  getCurrentUserRating(@CurrentUser() user: any) {
    return this.usersService.getUserRating(user.sub);
  }

  // ==================== Seller Upgrade Routes ====================
  
  @Post('seller-upgrade/request')
  @Roles(UserRole.BIDDER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request seller upgrade (BIDDER only)' })
  @ApiResponse({ status: 201, description: 'Upgrade request submitted successfully' })
  @ApiResponse({ status: 403, description: 'Only BIDDER can request upgrade' })
  @ApiResponse({ status: 400, description: 'Already have pending request or already a SELLER' })
  @ApiBody({ type: RequestSellerUpgradeDto })
  requestSellerUpgrade(
    @CurrentUser() user: any,
    @Body() requestDto: RequestSellerUpgradeDto,
  ) {
    return this.usersService.requestSellerUpgrade(user.sub, requestDto);
  }

  @Get('seller-upgrade/pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all pending seller upgrade requests (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Pending requests retrieved successfully' })
  getPendingRequests() {
    return this.usersService.getPendingSellerUpgradeRequests();
  }

  @Post('seller-upgrade/:requestId/approve')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve seller upgrade request (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Request approved, user upgraded to SELLER' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiParam({ name: 'requestId', description: 'Seller upgrade request ID' })
  approveSellerUpgrade(@Param('requestId') requestId: string) {
    return this.usersService.approveSellerUpgrade(requestId);
  }

  @Post('seller-upgrade/:requestId/reject')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject seller upgrade request (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Request rejected' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiParam({ name: 'requestId', description: 'Seller upgrade request ID' })
  rejectSellerUpgrade(@Param('requestId') requestId: string) {
    return this.usersService.rejectSellerUpgrade(requestId);
  }

  // ==================== Admin Routes ====================
  
  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user (ADMIN only)' })
  @ApiResponse({ status: 201, description: 'User successfully created' })
  @ApiResponse({ status: 403, description: 'Only ADMIN can create users' })
  @ApiBody({ type: CreateUserDto })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users (ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user by ID (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id/rating')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user rating by ID (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Rating retrieved successfully' })
  getUserRating(@Param('id') id: string) {
    return this.usersService.getUserRating(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user by ID (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiBody({ type: UpdateUserDto })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user by ID (ADMIN only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 204, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
