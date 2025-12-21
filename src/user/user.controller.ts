/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { CurrentUser } from 'src/common/decorators/currentUser.decorator';
import { Public } from 'src/common/decorators/public.decorator';

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
import { ChangeEmailRequestDto } from './dto/change-email-request.dto';
import { ChangeEmailResponseDto } from './dto/change-email-response.dto';
import { ChangeEmailVerifyDto } from './dto/change-email-verify.dto';
import { ChangeNameDto } from './dto/change-name.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ForgotPasswordRequestDto, ForgotPasswordVerifyDto } from './dto/forget-password.dto';
import { RequestSellerUpgradeDto } from './dto/request-seller-upgrade.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './user.service';

@ApiTags('users')
@Controller('users')
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ==================== Current User Routes ====================

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  getCurrentUser(@CurrentUser() user: any) {
    return this.usersService.findOne(user.id);
  }

  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 403, description: 'Cannot update own role' })
  @ApiBody({ type: UpdateUserDto })
  updateCurrentUser(@CurrentUser() user: any, @Body() updateUserDto: UpdateUserDto) {
    // Prevent users from updating their own role
    if (updateUserDto.role) {
      throw new ForbiddenException('Cannot update own role');
    }
    return this.usersService.update(user.id, updateUserDto);
  }

  @Get('me/rating')
  @ApiOperation({ summary: 'Get current user rating statistics' })
  @ApiResponse({ status: 200, description: 'Rating retrieved successfully' })
  getCurrentUserRating(@CurrentUser() user: any) {
    return this.usersService.getUserRating(user.id);
  }

  @Patch('change-name')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change full name' })
  @ApiResponse({ status: 200, description: 'Name updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  changeName(@CurrentUser() user: any, @Body() dto: ChangeNameDto) {
    return this.usersService.changeName(user.id, dto);
  }

  @Post('change-email/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request email change',
    description:
      'Sends an OTP to the new email address for verification. OTP expires in 10 minutes.',
  })
  @ApiBody({ type: ChangeEmailRequestDto })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Verification code sent to your new email address',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already in use',
  })
  requestEmailChange(
    @CurrentUser() user: any,
    @Body() dto: ChangeEmailRequestDto,
  ): Promise<{ message: string }> {
    return this.usersService.requestEmailChange(user.id, dto);
  }

  @Post('change-email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP and change email',
    description:
      'Verifies the OTP sent to the new email and updates the user email if valid. OTP can only be used once.',
  })
  @ApiBody({ type: ChangeEmailVerifyDto })
  @ApiResponse({
    status: 200,
    description: 'Email changed successfully',
    type: ChangeEmailResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired OTP / Email already in use',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: {
          type: 'string',
          example: 'Invalid or expired OTP',
        },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User not authenticated',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  verifyAndChangeEmail(
    @CurrentUser() user: any,
    @Body() dto: ChangeEmailVerifyDto,
  ): Promise<ChangeEmailResponseDto> {
    return this.usersService.verifyAndChangeEmail(user.id, dto);
  }

  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password (requires old password)' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 403, description: 'Old password is incorrect' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Public()
  @Post('forgot-password/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset (sends OTP to email)' })
  @ApiResponse({ status: 200, description: 'OTP sent to email successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  requestForgotPassword(@Body() dto: ForgotPasswordRequestDto) {
    return this.usersService.requestForgotPassword(dto);
  }

  @Public()
  @Post('forgot-password/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and reset password' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  verifyForgotPassword(@Body() dto: ForgotPasswordVerifyDto) {
    return this.usersService.verifyAndResetPassword(dto);
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
  requestSellerUpgrade(@CurrentUser() user: any, @Body() requestDto: RequestSellerUpgradeDto) {
    return this.usersService.requestSellerUpgrade(user.id, requestDto);
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

  @Get('me/seller-status')
  @ApiOperation({
    summary: 'Get current user seller expiration status',
  })
  @ApiResponse({
    status: 200,
    description: 'Seller status retrieved successfully',
  })
  getMySellerStatus(@CurrentUser() user: any) {
    return this.usersService.getSellerExpirationStatus(user.id);
  }

  @Get(':id/seller-status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get user seller expiration status (ADMIN only)',
  })
  getUserSellerStatus(@Param('id') id: string) {
    return this.usersService.getSellerExpirationStatus(id);
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

  // ==================== Cron Job Test Routes ====================

  @Post('cron/check-expired-sellers')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually trigger check expired sellers (ADMIN only - FOR TESTING)',
    description: 'Manually run the cron job to check and downgrade expired sellers',
  })
  @ApiResponse({
    status: 200,
    description: 'Cron job executed successfully',
    schema: {
      example: {
        message: 'Downgraded 2 expired sellers',
        users: [
          { id: 'user-id-1', email: 'user1@example.com' },
          { id: 'user-id-2', email: 'user2@example.com' },
        ],
      },
    },
  })
  async triggerCheckExpiredSellers() {
    return this.usersService.checkExpiredSellers();
  }
}
