import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "src/prisma/prisma.module";
import { PaymentController } from "./payment.controller";
import { PaypalService } from "./paypal.service";
import { OrdersModule } from "../orders/orders.module";

@Module({
    imports:[ConfigModule, PrismaModule, forwardRef(() => OrdersModule)],
    controllers:[PaymentController],
    providers:[PaypalService],
    exports:[PaypalService],
})
export class PaymentModule{}