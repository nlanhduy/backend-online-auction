/* eslint-disable @typescript-eslint/no-unused-vars */

/* eslint-disable prettier/prettier */
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/mail/mail.service';
import { OtpService } from 'src/otp/otp.service';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChangeEmailRequestDto } from './dto/change-email-request.dto';
import { ChangeEmailVerifyDto } from './dto/change-email-verify.dto';
import { ChangeNameDto } from './dto/change-name.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { RequestSellerUpgradeDto } from './dto/request-seller-upgrade.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) {}
  async create(createUserDto: CreateUserDto) {
    const { email, password, fullName, dateOfBirth, address, role } = createUserDto;

    // Check if user with email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Create new user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: address || '',
        role: role || UserRole.BIDDER,
      },
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        address: true,
        dateOfBirth: true,
        role: true,
        positiveRating: true,
        negativeRating: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return users;
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        address: true,
        dateOfBirth: true,
        role: true,
        positiveRating: true,
        negativeRating: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Check if user exists
    await this.findOne(id);

    // Update user
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: updateUserDto.fullName,
        dateOfBirth: updateUserDto.dateOfBirth ? new Date(updateUserDto.dateOfBirth) : undefined,
        address: updateUserDto.address,
        role: updateUserDto.role,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        address: true,
        dateOfBirth: true,
        role: true,
        positiveRating: true,
        negativeRating: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async changeName(userId: string, dto: ChangeNameDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
      },
      select: {
        id: true,
        fullName: true,
        updatedAt: true,
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        password: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const isOldPasswordValid = await bcrypt.compare(dto.oldPassword, user.password);

    if (!isOldPasswordValid) {
      throw new ForbiddenException('Old password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });
  }

  async requestEmailChange(
    userId: string,
    dto: ChangeEmailRequestDto,
  ): Promise<{ message: string }> {
    const { newEmail } = dto;

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    // Generate OTP
    const otp = this.otpService.generateOtp();

    // Store OTP in cache
    await this.otpService.storeOtp(newEmail, otp, userId);

    // Send OTP via email
    await this.mailService.sendChangeEmailOtp(newEmail, otp);

    return {
      message: 'Verification code sent to your new email address',
    };
  }

  /**
   * Verify OTP and change email
   */
  async verifyAndChangeEmail(
    userId: string,
    dto: ChangeEmailVerifyDto,
  ): Promise<{ message: string }> {
    const { newEmail, otp } = dto;

    // Verify OTP
    const verifiedUserId = await this.otpService.verifyOtp(newEmail, otp);
    console.log({ verifiedUserId });

    if (!verifiedUserId) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Verify that the OTP belongs to the current user
    if (verifiedUserId !== userId) {
      throw new BadRequestException('OTP does not match current user');
    }

    // Double-check email availability before update
    const existingUser = await this.prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingUser) {
      // Clear OTP as it's no longer valid
      this.otpService.clearOtp(newEmail);
      throw new BadRequestException('Email already in use');
    }

    // Update user email
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { email: newEmail },
      });

      // Clear OTP after successful update (one-time use)
      this.otpService.clearOtp(newEmail);

      return {
        message: 'Email changed successfully',
      };
    } catch (error) {
      // Clear OTP on error
      this.otpService.clearOtp(newEmail);

      throw new BadRequestException('Failed to update email');
    }
  }

  async remove(id: string) {
    // Check if user exists
    await this.findOne(id);

    // Delete user
    await this.prisma.user.delete({
      where: { id },
    });

    return { message: 'User deleted successfully' };
  }

  async requestSellerUpgrade(userId: string, requestDto: RequestSellerUpgradeDto) {
    // Check if user exists
    const user = await this.findOne(userId);

    // Check if user is already a seller or admin
    if (user.role === UserRole.SELLER || user.role === UserRole.ADMIN) {
      throw new BadRequestException('User is already a seller or admin');
    }

    // Check if there's a pending request
    const pendingRequest = await this.prisma.sellerUpgradeRequest.findFirst({
      where: {
        userId,
        status: 'PENDING',
      },
    });

    if (pendingRequest) {
      throw new ConflictException('There is already a pending seller upgrade request');
    }

    // Create upgrade request
    const request = await this.prisma.sellerUpgradeRequest.create({
      data: {
        userId,
        // You could add more fields here if needed
      },
    });

    return {
      message: 'Seller upgrade request submitted successfully',
      request,
    };
  }

  async approveSellerUpgrade(requestId: string) {
    // Find the request
    const request = await this.prisma.sellerUpgradeRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new NotFoundException(`Upgrade request with ID ${requestId} not found`);
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Request has already been processed');
    }

    // Update request status
    const updatedRequest = await this.prisma.sellerUpgradeRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED' },
    });

    // Update user role to SELLER
    await this.prisma.user.update({
      where: { id: request.userId },
      data: { role: UserRole.SELLER },
    });

    return {
      message: 'Seller upgrade request approved',
      request: updatedRequest,
    };
  }

  async rejectSellerUpgrade(requestId: string) {
    // Find the request
    const request = await this.prisma.sellerUpgradeRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException(`Upgrade request with ID ${requestId} not found`);
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Request has already been processed');
    }

    // Update request status
    const updatedRequest = await this.prisma.sellerUpgradeRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' },
    });

    return {
      message: 'Seller upgrade request rejected',
      request: updatedRequest,
    };
  }

  async getPendingSellerUpgradeRequests() {
    const requests = await this.prisma.sellerUpgradeRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            positiveRating: true,
            negativeRating: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return requests;
  }

  async getUserRating(userId: string) {
    const user = await this.findOne(userId);

    const totalRatings = user.positiveRating + user.negativeRating;
    const positivePercentage = totalRatings > 0 ? (user.positiveRating / totalRatings) * 100 : 0;

    return {
      positiveRating: user.positiveRating,
      negativeRating: user.negativeRating,
      totalRatings,
      positivePercentage,
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }
}
