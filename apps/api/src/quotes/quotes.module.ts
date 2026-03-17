import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module.js";
import { AdminQuotesController } from "./admin-quotes.controller.js";
import { PublicQuotePaymentController } from "./public-quote-payment.controller.js";
import { QuotesController } from "./quotes.controller.js";
import { QuotesService } from "./quotes.service.js";

@Module({
  imports: [PaymentsModule],
  controllers: [QuotesController, AdminQuotesController, PublicQuotePaymentController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
