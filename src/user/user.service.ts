/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
import { Cron, CronExpression } from '@nestjs/schedule';
import { UpgradeStatus, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChangeEmailRequestDto } from './dto/change-email-request.dto';
import { ChangeEmailVerifyDto } from './dto/change-email-verify.dto';
import { ChangeNameDto } from './dto/change-name.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ForgotPasswordRequestDto, ForgotPasswordVerifyDto } from './dto/forget-password.dto';
import { GetUserProductDto } from './dto/get-user-product.dto';
import { RequestSellerUpgradeDto } from './dto/request-seller-upgrade.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly SELLER_DURATION_DAYS = 7;
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

  async findAll(page = 1, limit = 10) {
    // sanitize
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));

    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip,
        take: limitNum,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.user.count(),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return {
      users,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrevious: pageNum > 1,
    };
  }

  async getAllUserProducts(userId: string, getUserProductDto: GetUserProductDto) {
    const { page = 1, limit = 10 } = getUserProductDto;

    const skip = (page - 1) * limit;
    const now = new Date();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { sellerId: userId },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          category: true,

          bids: {
            where: { rejected: false },
            orderBy: { amount: 'desc' },
            take: 1,
            select: {
              amount: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },

          _count: {
            select: {
              bids: {
                where: { rejected: false },
              },
            },
          },
        },
      }),

      this.prisma.product.count({
        where: { sellerId: userId },
      }),
    ]);

    const transformProduct = (product: any) => ({
      id: product.id,
      name: product.name,
      mainImage: product.mainImage,
      currentPrice: product.currentPrice,
      buyNowPrice: product.buyNowPrice,
      createdAt: product.createdAt,
      endTime: product.endTime,
      timeRemaining: product.endTime.getTime() - now.getTime(),
      totalBids: product._count.bids,
      highestBidder: product.bids[0]?.user || null,
      category: product.category,
    });

    const mappedItems = items.map(transformProduct);

    const totalPages = Math.ceil(total / limit);

    return {
      items: mappedItems,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { password: _, ...userWithoutPassword } = user;

    return userWithoutPassword;
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
        password: updateUserDto.password
          ? await this.hashPassword(updateUserDto.password)
          : undefined,
        email: updateUserDto.email,
        updatedAt: new Date(),
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

    if (user.password === null) {
      throw new BadRequestException('Password not set');
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

  async requestForgotPassword(dto: ForgotPasswordRequestDto): Promise<{ message: string }> {
    const { email } = dto;

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User with this email does not exist');
    }

    // Generate OTP
    const otp = this.otpService.generateOtp();

    // Store OTP in cache with user ID
    await this.otpService.storeOtp(email, otp, user.id);

    // Send OTP via email
    await this.mailService.sendForgotPasswordOtp(email, otp);

    return {
      message: 'Password reset code sent to your email address',
    };
  }

  async verifyAndResetPassword(dto: ForgotPasswordVerifyDto): Promise<{ message: string }> {
    const { email, otp, newPassword } = dto;

    // Verify OTP
    const verifiedUserId = await this.otpService.verifyOtp(email, otp);

    if (!verifiedUserId) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Get user
    const user = await this.prisma.user.findUnique({
      where: { id: verifiedUserId },
    });

    if (!user || user.email !== email) {
      throw new BadRequestException('Invalid user or email mismatch');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    try {
      await this.prisma.user.update({
        where: { id: verifiedUserId },
        data: { password: hashedPassword },
      });

      // Clear OTP after successful update (one-time use)
      this.otpService.clearOtp(email);

      return {
        message: 'Password reset successfully',
      };
    } catch (error) {
      // Clear OTP on error
      this.otpService.clearOtp(email);

      throw new BadRequestException('Failed to reset password');
    }
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

    // Check if user is admin
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('User is admin, cannot request seller upgrade');
    }

    // Check if user is already a seller
    if (user.role === UserRole.SELLER) {
      if (user.sellerExpiration) {
        const now = new Date();
        if (user.sellerExpiration > now) {
          const daysLeft = Math.ceil(
            (user.sellerExpiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          );
          throw new BadRequestException(`User is already a seller with ${daysLeft} days remaining`);
        }
      } else {
        // Permanent seller (no expiration)
        throw new BadRequestException('Expiration day of user is not set properly');
      }
    }

    // Check if there's a pending request
    const pendingRequest = await this.prisma.sellerUpgradeRequest.findFirst({
      where: {
        userId,
        status: UpgradeStatus.PENDING,
      },
    });

    if (pendingRequest) {
      throw new ConflictException('There is already a pending seller upgrade request');
    }

    // Create new upgrade request
    const request = await this.prisma.sellerUpgradeRequest.create({
      data: {
        userId,
        status: UpgradeStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
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

    if (request.status !== UpgradeStatus.PENDING) {
      throw new BadRequestException(`Request has already been ${request.status.toLowerCase()}`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SELLER_DURATION_DAYS * 24 * 60 * 60 * 1000);
    // // Update request status
    // const updatedRequest = await this.prisma.sellerUpgradeRequest.update({
    //   where: { id: requestId },
    //   data: { status: UpgradeStatus.APPROVED },
    // });

    // Update request and user
    const [updateRequest, updateUser] = await this.prisma.$transaction([
      // Update request status
      this.prisma.sellerUpgradeRequest.update({
        where: { id: requestId },
        data: {
          status: UpgradeStatus.APPROVED,
          updatedAt: now,
        },
      }),
      // Upgrade user role to SELLER with expiration
      this.prisma.user.update({
        where: { id: request.userId },
        data: {
          role: UserRole.SELLER,
          sellerExpiration: expiresAt,
        },
      }),
    ]);

    // Send approval email
    await this.mailService.sendSellerUpgradeApproval(
      request.user.email,
      request.user.fullName,
      expiresAt,
    );

    return {
      message: 'Seller upgrade request approved',
      request: updateRequest,
      user: {
        id: updateUser.id,
        role: updateUser.role,
        sellerExpiration: updateUser.sellerExpiration,
      },
    };
  }

  async rejectSellerUpgrade(requestId: string) {
    // Find the request
    const request = await this.prisma.sellerUpgradeRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new NotFoundException(`Upgrade request with ID ${requestId} not found`);
    }

    if (request.status !== UpgradeStatus.PENDING) {
      throw new BadRequestException('Request has already been processed');
    }

    // Update request status
    const updatedRequest = await this.prisma.sellerUpgradeRequest.update({
      where: { id: requestId },
      data: { status: UpgradeStatus.REJECTED },
    });

    return {
      message: 'Seller upgrade request rejected',
      request: updatedRequest,
    };
  }

  async getPendingSellerUpgradeRequests() {
    const requests = await this.prisma.sellerUpgradeRequest.findMany({
      where: { status: UpgradeStatus.PENDING },
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

  async getUserUpgradeRequests(userId: string) {
    const requests = await this.prisma.sellerUpgradeRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
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

  // Check and downgrade expired sellers, to be run periodically each hour
  // For testing: Change to @Cron(CronExpression.EVERY_MINUTE) to test every minute
  @Cron(CronExpression.EVERY_HOUR) // Every hour at minute 0
  async checkExpiredSellers() {
    const now = new Date();
    const expiredSellers = await this.prisma.user.findMany({
      where: {
        role: UserRole.SELLER,
        sellerExpiration: {
          lt: now,
        },
      },
    });

    if (expiredSellers.length === 0) {
      return;
    }
    console.log(`Downgrading ${expiredSellers.length} expired sellers to bidders.`);
    // Downgrade all expired sellers to BIDDER
    const downgraded = await this.prisma.$transaction(
      expiredSellers.map((seller) =>
        this.prisma.user.update({
          where: { id: seller.id },
          data: {
            role: UserRole.BIDDER,
            sellerExpiration: null,
          },
        }),
      ),
    );

    // Mark their upgrade requests as EXPIRED
    await this.prisma.sellerUpgradeRequest.updateMany({
      where: {
        userId: { in: expiredSellers.map((u) => u.id) },
        status: UpgradeStatus.APPROVED,
      },
      data: {
        status: UpgradeStatus.EXPIRED,
      },
    });

    // Send expiration emails
    for (const user of expiredSellers) {
      await this.mailService.sendSellerExpiredNotification(user.email, user.fullName);
    }

    console.log(`Downgraded ${downgraded.length} users from SELLER to BIDDER.`);
    return {
      message: `Downgraded ${downgraded.length} users from SELLER to BIDDER.`,
      users: downgraded.map((u) => ({ id: u.id, email: u.email })),
    };
  }

  // Check seller expiration status
  async getSellerExpirationStatus(userId: string) {
    const user = await this.findOne(userId);
    if (user.role !== UserRole.SELLER) {
      return {
        isSeller: false,
        message: 'User is not a seller',
      };
    }

    // Check if seller has expiration date
    if (!user.sellerExpiration) {
      return {
        isSeller: true,
        isPermanent: true,
        expired: false,
        sellerExpiration: null,
        daysLeft: null,
        message: 'User do not have expiration date (permanent seller)',
      };
    }

    const now = new Date();
    const isExpired = user.sellerExpiration <= now;
    const daysLeft = Math.ceil(
      (user.sellerExpiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      isSeller: true,
      isPermanent: false,
      expired: isExpired,
      sellerExpiration: user.sellerExpiration,
      daysLeft: isExpired ? 0 : daysLeft,
      message: isExpired
        ? 'Seller status has expired'
        : `Seller status valid for ${daysLeft} more days`,
    };
  }

  async getUserRatingDetails(userId: string) {
    const user = await this.findOne(userId);

    const ratings = await this.prisma.rating.findMany({
      where: {
        receiverId: userId,
      },
      include: {
        giver: {
          select: {
            id: true,
            fullName: true,
            avatar: true,
            profilePicture: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const totalRatings = user.positiveRating + user.negativeRating;
    const positivePercentage = totalRatings > 0 ? (user.positiveRating / totalRatings) * 100 : 0;
    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        avatar: user.avatar,
        profilePicture: user.profilePicture,
      },
      positiveRating: user.positiveRating,
      negativeRating: user.negativeRating,
      totalRatings,
      positivePercentage,
      ratings,
    };
  }

  // Get ratings that current user has GIVEN to others
  async getMyGivenRatings(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [ratings, total] = await Promise.all([
      this.prisma.rating.findMany({
        where: {
          giverId: userId,
        },
        include: {
          receiver: {
            select: {
              id: true,
              fullName: true,
              avatar: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.rating.count({
        where: {
          giverId: userId,
        },
      }),
    ]);

    return {
      items: ratings,
      total,
      page,
      limit,
    };
  }

  async getMyActiveBids(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    // Take all product that user has bid on and the bid is not rejected
    const bids = await this.prisma.bid.findMany({
      where: {
        userId,
        rejected: false,
        product: {
          status: 'ACTIVE',
        },
      },
      include: {
        product: {
          include: {
            category: true,
            seller: {
              select: {
                id: true,
                fullName: true,
              },
            },
            _count: {
              select: {
                bids: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['productId'], // one product only take one time
      skip,
      take: limit,
    });

    // count total unique products
    const total = await this.prisma.bid.findMany({
      where: {
        userId,
        rejected: false,
        product: { status: 'ACTIVE' },
      },
      distinct: ['productId'],
      select: { productId: true },
    });
    return {
      items: bids.map((bid) => ({
        bidId: bid.id,
        myBidAmount: bid.amount,
        bidTime: bid.createdAt,
        product: bid.product,
      })),
      total: total.length,
      page,
      limit,
    };
  }
  async getMyWonProducts(userId: string, page = 1, limit = 10) {
    // get all the won product from bidder
    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          winnerId: userId,
          status: 'COMPLETED',
        },
        include: {
          category: true,
          seller: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          bids: {
            where: { userId },
            orderBy: { amount: 'desc' },
            take: 1,
          },
        },
        orderBy: { endTime: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({
        where: {
          winnerId: userId,
          status: 'COMPLETED',
        },
      }),
    ]);
    return {
      items: products.map((product) => ({
        ...product,
        myWinningBid: product.bids[0]?.amount || product.currentPrice,
      })),
      total,
      page,
      limit,
    };
  }

  // Get products that seller has sold (with winners) - FOR SELLER
  async getMyCompletedSales(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          sellerId: userId,
          status: 'COMPLETED',
          winnerId: { not: null }, // Must have a winner
        },
        include: {
          category: true,
          bids: {
            where: { userId: { not: userId } }, // Exclude seller's own bids
            orderBy: { amount: 'desc' },
            take: 1,
          },
        },
        orderBy: { endTime: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({
        where: {
          sellerId: userId,
          status: 'COMPLETED',
          winnerId: { not: null },
        },
      }),
    ]);

    // Fetch winner info separately for each product
    const productsWithWinner = await Promise.all(
      products.map(async (product) => {
        const winner = product.winnerId
          ? await this.prisma.user.findUnique({
              where: { id: product.winnerId },
              select: {
                id: true,
                fullName: true,
                email: true,
                positiveRating: true,
                negativeRating: true,
              },
            })
          : null;

        return {
          ...product,
          winner,
          finalPrice: product.currentPrice,
        };
      }),
    );

    return {
      items: productsWithWinner,
      total,
      page,
      limit,
    };
  }
  async createRating(giverId: string, dto: CreateRatingDto) {
    const { receiverId, value, comment } = dto;
    // User cannot rate themselves
    if (giverId === receiverId) {
      throw new BadRequestException('Cannot rate yourself');
    }

    // Check if receiver exists
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
    });
    if (!receiver) {
      throw new NotFoundException('User not found');
    }

    // Get giver info
    const giver = await this.prisma.user.findUnique({
      where: { id: giverId },
    });

    if (!giver) {
      throw new NotFoundException('Giver user not found');
    }

    // Validate rating relationship:
    // Case 1: BIDDER rates SELLER (after winning)
    // Case 2: SELLER rates BIDDER (after selling)
    if (giver.role === UserRole.BIDDER && receiver.role === UserRole.SELLER) {
      // Bidder can rate seller if they won from that seller
      const hasPurchased = await this.prisma.product.count({
        where: {
          sellerId: receiverId,
          winnerId: giverId,
          status: 'COMPLETED',
        },
      });

      if (hasPurchased === 0) {
        throw new BadRequestException('You can only rate sellers you have purchased from');
      }
    } else if (giver.role === UserRole.SELLER && receiver.role === UserRole.BIDDER) {
      // Seller can rate bidder if that bidder won from seller
      const hasSold = await this.prisma.product.count({
        where: {
          sellerId: giverId,
          winnerId: receiverId,
          status: 'COMPLETED',
        },
      });

      if (hasSold === 0) {
        throw new BadRequestException('You can only rate buyers who have won your products');
      }
    } else {
      throw new BadRequestException(
        'Invalid rating relationship. Only BIDDER can rate SELLER or SELLER can rate BIDDER',
      );
    }

    // If user has already rated the receiver, prevent multiple ratings
    const existingRating = await this.prisma.rating.findFirst({
      where: {
        giverId,
        receiverId,
      },
    });

    if (existingRating) {
      throw new BadRequestException('You have already rated this user');
    }

    // Create rating and update user rating count in transaction
    const rating = await this.prisma.$transaction(async (tx) => {
      const newRating = await tx.rating.create({
        data: {
          giverId,
          receiverId,
          value,
          comment,
        },
        include: {
          receiver: {
            select: {
              id: true,
              fullName: true,
              positiveRating: true,
              negativeRating: true,
              role: true,
            },
          },
        },
      });

      // Update receiver's rating negative/positive
      await tx.user.update({
        where: { id: receiverId },
        data: {
          positiveRating: value === 1 ? { increment: 1 } : undefined,
          negativeRating: value === -1 ? { increment: 1 } : undefined,
        },
      });
      return newRating;
    });

    return rating;
  }
}
