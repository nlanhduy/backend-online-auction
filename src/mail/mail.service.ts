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
   * HTML template for OTP email
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
}
