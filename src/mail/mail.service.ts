/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as nodemailer from 'nodemailer';

// src/mail/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
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
    createdAt: Date;
    updatedAt?: Date;
  }): Promise<void> {
    const mailFrom = this.configService.get<string>('MAIL_FROM', 'noreply@yourapp.com');
    const frontendBaseUrl = this.configService.get<string>(
      'FRONT_END_BASE_URL',
      'http://localhost:3000',
    );
    const productLink = `${frontendBaseUrl}/products/${data.productId}`;

    const mailOptions = {
      from: mailFrom,
      to: data.ownerEmail,
      subject: `New ${data.actionType === 'created' ? 'Question' : 'Update'} on Your Product: ${data.productName}`,
      html: this.getQuestionNotificationTemplate(data, productLink),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Question notification email sent successfully to ${data.ownerEmail}. MessageId: ${info.messageId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send question notification email to ${data.ownerEmail}`, error);
      // Don't throw error - notification failure shouldn't break the main flow
      // Just log it for monitoring
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
   */
  private getQuestionNotificationTemplate(
    data: {
      ownerName: string;
      productName: string;
      questionContent: string;
      userName: string;
      userEmail: string;
      actionType: 'created' | 'updated';
      createdAt: Date;
      updatedAt?: Date;
    },
    productLink: string,
  ): string {
    const actionText =
      data.actionType === 'created' ? 'asked a new question' : 'updated their question';
    const actionColor = data.actionType === 'created' ? '#4CAF50' : '#2196F3';

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
            <h1>💬 ${data.actionType === 'created' ? 'New Question' : 'Question Updated'}</h1>
          </div>
          <div class="content">
            <p>Hello ${data.ownerName},</p>
            <p>A customer ${actionText} on your product <strong>${data.productName}</strong>:</p>
            
            <div class="question-box">
              <strong>Question:</strong>
              <p style="margin-top: 10px;">${data.questionContent}</p>
            </div>

            <div class="info-row">
              <span class="info-label">From:</span>
              <span class="info-value">${data.userName}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">Email:</span>
              <span class="info-value">${data.userEmail}</span>
            </div>
            
            <div class="info-row">
              <span class="info-label">Created:</span>
              <span class="info-value">${data.createdAt.toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}</span>
            </div>
            
            ${
              data.updatedAt
                ? `
            <div class="info-row">
              <span class="info-label">Updated:</span>
              <span class="info-value">${data.updatedAt.toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}</span>
            </div>
            `
                : ''
            }

            <div class="button-container">
              <a href="${productLink}" class="view-button">
                View Product & Reply →
              </a>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              You can respond to this question directly on your product page to help your customer.
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
}
