import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "src/prisma/prisma.module";
import { PaymentController } from "./payment.controller";
import { PaypalService } from "./paypal.service";

@Module({
    imports:[ConfigModule, PrismaModule],
    controllers:[PaymentController],
    providers:[PaypalService],
    exports:[PaypalService],
})
export class PaymentModule{}