/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as nodemailer from 'nodemailer';

// src/mail/mail.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    // Configure transporter (use environment variables for production)
    const mailHost = this.configService.get<string>('MAIL_HOST', 'smtp.gmail.com');
    const mailPort = this.configService.get<number>('MAIL_PORT', 587);
    const mailUser = this.configService.get<string>('MAIL_USER');
    const mailPassword = this.configService.get<string>('MAIL_PASSWORD');

    this.transporter = nodemailer.createTransport({
      host: mailHost,
      port: Number(mailPort),
      secure: false, // true for 465, false for other ports
      auth: {
        user: mailUser,
        pass: mailPassword,
      },
    });

    // Verify transporter configuration
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Mail transporter configuration error:', error);
      } else {
        this.logger.log('Mail service is ready to send emails');
      }
    });
  }

  /**
   * Send OTP email for registration verification
   */
  async sendRegistrationOtp(email: string, otp: string): Promise<void> {
    const mailFrom = this.configService.get<string>('MAIL_FROM', 'noreply@yourapp.com');

    const mailOptions = {
      from: mailFrom,
      to: email,
      subject: 'Complete Your Registration - OTP Code',
      html: this.getRegistrationOtpTemplate(otp),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Registration OTP email sent successfully to ${email}. MessageId: ${info.messageId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send registration OTP email to ${email}`, error);

      // Provide more specific error message
      if (error instanceof Error) {
        throw new Error(`Failed to send verification email: ${error.message}`);
      }
      throw new Error('Failed to send verification email');
    }
  }

  /**
   * Send OTP email for email change verification
   */
  async sendChangeEmailOtp(email: string, otp: string): Promise<void> {
    const mailFrom = this.configService.get<string>('MAIL_FROM', 'noreply@yourapp.com');

    const mailOptions = {
      from: mailFrom,
      to: email,
      subject: 'Email Change Verification - OTP Code',
      html: this.getOtpEmailTemplate(otp),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`OTP email sent successfully to ${email}. MessageId: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}`, error);

      // Provide more specific error message
      if (error instanceof Error) {
        throw new Error(`Failed to send verification email: ${error.message}`);
      }
      throw new Error('Failed to send verification email');
    }
  }

  /**
   * Send notification email to product owner about new/updated question
   */
  async sendQuestionNotification(data: {
    ownerEmail: string;
    ownerName: string;
    productName: string;
    productId: string;
    questionContent: string;
    userName: string;
    userEmail: string;
    actionType: 'created' | 'updated';
    context: 'BUYER_QUESTION' | 'SELLER_REPLY';
    createdAt: Date;
    updatedAt?: Date;
  }): Promise<void> {
    const mailFrom = this.configService.get<string>('MAIL_FROM', 'noreply@yourapp.com');
    const frontendBaseUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const productLink = `${frontendBaseUrl}/product/${data.productId}`;

    const subject =
      data.context === 'BUYER_QUESTION'
        ? `New ${data.actionType === 'created' ? 'Question' : 'Update'} on Your Product: ${data.productName}`
        : `Seller replied on product: ${data.productName}`;

    const mailOptions = {
      from: mailFrom,
      to: data.ownerEmail,
      subject,
      html: this.getQuestionNotificationTemplate(data, productLink),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Question notification email sent to ${data.ownerEmail}. MessageId: ${info.messageId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send question notification email to ${data.ownerEmail}`, error);
    }
  }

  /**
   * HTML template for registration OTP email
   */
  private getRegistrationOtpTemplate(otp: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .otp-code { 
            font-size: 32px; 
            font-weight: bold; 
            color: #2196F3; 
            text-align: center; 
            letter-spacing: 5px;
            padding: 20px;
            background-color: #fff;
            border: 2px dashed #2196F3;
            border-radius: 5px;
            margin: 20px 0;
          }
          .warning { color: #ff6b6b; font-size: 14px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome! Complete Your Registration</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>Thank you for registering! Please use the following One-Time Password (OTP) to verify your email and complete your registration:</p>
            <div class="otp-code">${otp}</div>
            <p>This code will expire in <strong>10 minutes</strong>.</p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul>
                <li>Never share this code with anyone</li>
                <li>This code can only be used once</li>
                <li>If you didn't request this registration, please ignore this email</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * HTML template for email change OTP
   */
  private getOtpEmailTemplate(otp: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
          .otp-code { 
            font-size: 32px; 
            font-weight: bold; 
            color: #4CAF50; 
            text-align: center; 
            letter-spacing: 5px;
            padding: 20px;
            background-color: #fff;
            border: 2px dashed #4CAF50;
            border-radius: 5px;
            margin: 20px 0;
          }
          .warning { color: #ff6b6b; font-size: 14px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Email Change Verification</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You have requested to change your email address. Please use the following One-Time Password (OTP) to verify your new email:</p>
            <div class="otp-code">${otp}</div>
            <p>This code will expire in <strong>10 minutes</strong>.</p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul>
                <li>Never share this code with anyone</li>
                <li>This code can only be used once</li>
                <li>If you didn't request this change, please ignore this email</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * HTML template for question notification email
   */ private getQuestionNotificationTemplate(
    data: {
      ownerName: string;
      productName: string;
      questionContent: string;
      userName: string;
      userEmail: string;
      actionType: 'created' | 'updated';
      context: 'BUYER_QUESTION' | 'SELLER_REPLY';
      createdAt: Date;
      updatedAt?: Date;
    },
    productLink: string,
  ): string {
    const isSellerReply = data.context === 'SELLER_REPLY';

    const actionText = isSellerReply
      ? 'replied to a question'
      : data.actionType === 'created'
        ? 'asked a new question'
        : 'updated their question';

    const headerTitle = isSellerReply
      ? '💬 Seller Reply'
      : data.actionType === 'created'
        ? '💬 New Question'
        : '✏️ Question Updated';

    const actionColor = isSellerReply
      ? '#7C3AED'
      : data.actionType === 'created'
        ? '#4CAF50'
        : '#2196F3';

    const messageTitle = isSellerReply ? 'Reply' : 'Question';

    const footerHint = isSellerReply
      ? 'You are receiving this email because you participated in bidding or asked a question about this product.'
      : 'You can respond to this question directly on your product page to help your customer.';

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: ${actionColor}; color: white; padding: 20px; text-align: center; }
    .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
    .question-box {
      background-color: #fff;
      border-left: 4px solid ${actionColor};
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .info-row { 
      margin: 10px 0; 
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .info-label { 
      font-weight: bold; 
      color: #555;
      display: inline-block;
      width: 120px;
    }
    .info-value { color: #333; }
    .button-container { text-align: center; margin: 30px 0; }
    .view-button {
      display: inline-block;
      padding: 15px 40px;
      background-color: ${actionColor};
      color: white;
      text-decoration: none;
      border-radius: 5px;
      font-weight: bold;
      font-size: 16px;
    }
    .view-button:hover { opacity: 0.9; }
    .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${headerTitle}</h1>
    </div>

    <div class="content">
      <p>Hello ${data.ownerName},</p>

      <p>
        ${
          isSellerReply
            ? `The seller has ${actionText} on the product <strong>${data.productName}</strong>:`
            : `A customer has ${actionText} on your product <strong>${data.productName}</strong>:`
        }
      </p>

      <div class="question-box">
        <strong>${messageTitle}:</strong>
        <p style="margin-top: 10px;">${data.questionContent}</p>
      </div>

      <div class="info-row">
        <span class="info-label">${isSellerReply ? 'Seller:' : 'From:'}</span>
        <span class="info-value">${data.userName}</span>
      </div>

      <div class="info-row">
        <span class="info-label">Email:</span>
        <span class="info-value">${data.userEmail}</span>
      </div>

      <div class="info-row">
        <span class="info-label">Created:</span>
        <span class="info-value">
          ${data.createdAt.toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
      </div>

      ${
        data.updatedAt
          ? `
      <div class="info-row">
        <span class="info-label">Updated:</span>
        <span class="info-value">
          ${data.updatedAt.toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
      </div>
      `
          : ''
      }

      <div class="button-container">
        <a href="${productLink}" class="view-button">
          View Product →
        </a>
      </div>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        ${footerHint}
      </p>
    </div>

    <div class="footer">
      <p>This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
`;
  }

  async sendSellerUpgradeRequestConfirmation(email: string, fullName: string) {
    await this.transporter.sendMail({
      to: email,
      subject: 'Seller Upgrade Request Received',
      html: `
        <h2>Hello ${fullName},</h2>
        <p>We have received your request to upgrade to a seller account.</p>
        <p>Our admin team will review your request and notify you of the decision.</p>
        <p>Thank you for your patience!</p>
      `,
    });
  }

  async sendSellerUpgradeApproval(email: string, fullName: string, expiresAt: Date) {
    const formattedDate = expiresAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    await this.transporter.sendMail({
      to: email,
      subject: 'Seller Upgrade Approved! 🎉',
      html: `
        <h2>Congratulations ${fullName}!</h2>
        <p>Your seller upgrade request has been <strong>approved</strong>!</p>
        <p>You now have seller privileges for <strong>7 days</strong>.</p>
        <p><strong>Expires on:</strong> ${formattedDate}</p>
        <p>Start creating your product listings now!</p>
        <a href="${this.configService.get('FRONTEND_URL')}/seller/products/new">Create Product</a>
      `,
    });
  }

  async sendSellerUpgradeRejection(email: string, fullName: string, reason?: string) {
    await this.transporter.sendMail({
      to: email,
      subject: 'Seller Upgrade Request Update',
      html: `
        <h2>Hello ${fullName},</h2>
        <p>We regret to inform you that your seller upgrade request has been declined.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>You can submit a new request in the future.</p>
        <p>If you have questions, please contact our support team.</p>
      `,
    });
  }

  async sendSellerExpiredNotification(email: string, fullName: string) {
    await this.transporter.sendMail({
      to: email,
      subject: 'Seller Access Expired',
      html: `
        <h2>Hello ${fullName},</h2>
        <p>Your 7-day seller access has expired.</p>
        <p>Your account has been reverted to <strong>BIDDER</strong> status.</p>
        <p>You can request another seller upgrade anytime!</p>
        <a href="${this.configService.get('FRONTEND_URL')}/seller-upgrade">Request Upgrade</a>
      `,
    });
  }

  async sendForgotPasswordOtp(email: string, otp: string): Promise<void> {
    const mailFrom = this.configService.get<string>('MAIL_FROM', 'noreply@yourapp.com');

    const mailOptions = {
      from: mailFrom,
      to: email,
      subject: 'Password Reset Request',
      html: this.getForgotPasswordTemplate(otp),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Forgot password OTP email sent successfully to ${email}. MessageId: ${info.messageId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send forgot password OTP email to ${email}`, error);
      throw new BadRequestException('Failed to send reset code. Please try again.');
    }
  }

  private getForgotPasswordTemplate(otp: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
        <h1 style="color: #2c3e50; margin-bottom: 20px;">Password Reset Request</h1>
        
        <p style="font-size: 16px; margin-bottom: 20px;">
          We received a request to reset your password. Use the verification code below to proceed:
        </p>
        
        <div style="background-color: #fff; border: 2px dashed #3498db; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
          <p style="font-size: 14px; color: #7f8c8d; margin-bottom: 10px;">Your verification code:</p>
          <h2 style="color: #3498db; font-size: 36px; letter-spacing: 8px; margin: 0; font-weight: bold;">
            ${otp}
          </h2>
        </div>
        
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #856404;">
            ⚠️ <strong>Important:</strong> This code will expire in 10 minutes.
          </p>
        </div>
        
        <p style="font-size: 14px; color: #7f8c8d; margin-top: 30px;">
          If you didn't request this password reset, please ignore this email or contact support if you have concerns.
        </p>
        
        <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #95a5a6; margin: 0;">
          This is an automated message, please do not reply to this email.
        </p>
      </div>
    </body>
    </html>
  `;
  }
}
