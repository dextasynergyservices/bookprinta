import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  PayQuoteByTokenDto,
  PayQuoteByTokenResponseDto,
  ResolveQuotePaymentTokenResponseDto,
} from "./dto/quote.dto.js";
import { QuotesService } from "./quotes.service.js";

@ApiTags("Quote Payment")
@Controller("pay")
export class PublicQuotePaymentController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get(":token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Resolve quote payment token",
    description:
      "Resolves the public quote payment token and returns quote details for a valid token " +
      "or branded status states for invalid/expired/paid/revoked links.",
  })
  @ApiResponse({
    status: 200,
    description: "Token resolution state",
    type: ResolveQuotePaymentTokenResponseDto,
  })
  async resolve(@Param("token") token: string): Promise<ResolveQuotePaymentTokenResponseDto> {
    return this.quotesService.resolvePaymentToken(token);
  }

  @Post(":token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Submit quote payment by token",
    description:
      "Starts quote payment from a public payment token using Paystack/Stripe/Bank Transfer and " +
      "returns next redirect destination.",
  })
  @ApiResponse({
    status: 200,
    description: "Payment submission accepted",
    type: PayQuoteByTokenResponseDto,
  })
  async pay(
    @Param("token") token: string,
    @Body() dto: PayQuoteByTokenDto
  ): Promise<PayQuoteByTokenResponseDto> {
    return this.quotesService.payByToken(token, dto);
  }
}
