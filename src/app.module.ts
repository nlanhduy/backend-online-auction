import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { BidsModule } from './bids/bids.module';
import { CategoriesModule } from './categories/categories.module';
import { ChatModule } from './chat/chat.module';
import { FavoritesModule } from './favorites/favorites.module';
import { HttpLoggerInterceptor } from './logger/http-logger.interceptor';
import { LoggerModule } from './logger/logger.module';
import { MailModule } from './mail/mail.module';
import { OrdersModule } from './orders/orders.module';
import { OtpModule } from './otp/otp.module';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { QuestionsModule } from './questions/questions.module';
import { SystemSettingsModule } from './system-setting/system-settings.module';
import { UsersModule } from './user/user.module';

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    UsersModule,
    FavoritesModule,
    QuestionsModule,
    OtpModule,
    MailModule,
    ScheduleModule.forRoot(),
    SystemSettingsModule,
    BidsModule,
    PaymentModule,
    OrdersModule,
    AdminModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggerInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
