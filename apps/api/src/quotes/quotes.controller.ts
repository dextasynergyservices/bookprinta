import { Body, Controller, Headers, HttpCode, HttpStatus, Ip, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { getIpTracker } from "../rate-limit/tracker.utils.js";
import {
  CreateQuoteDto,
  CreateQuoteResponseDto,
  QuoteEstimateDto,
  QuoteEstimateResponseDto,
} from "./dto/quote.dto.js";
import { QuotesService } from "./quotes.service.js";

const QUOTE_ESTIMATE_THROTTLE = {
  short: { limit: 10, ttl: 60_000, getTracker: getIpTracker },
  long: { limit: 30, ttl: 3_600_000, getTracker: getIpTracker },
};

const QUOTE_SUBMIT_THROTTLE = {
  short: { limit: 3, ttl: 3_600_000, getTracker: getIpTracker },
  long: { limit: 3, ttl: 3_600_000, getTracker: getIpTracker },
};

@ApiTags("Quotes")
@Controller("quotes")
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  /**
   * POST /api/v1/quotes/estimate
   * Public endpoint for the custom quote wizard estimator.
   */
  @Post("estimate")
  @HttpCode(HttpStatus.OK)
  @Throttle(QUOTE_ESTIMATE_THROTTLE)
  @ApiOperation({
    summary: "Estimate custom quote price range",
    description:
      "Calculates an estimated price range from estimated word count, book size, and quantity " +
      "for Path B (Custom Quote). Public endpoint.",
  })
  @ApiResponse({
    status: 200,
    description: "Estimated quote price range",
    type: QuoteEstimateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Validation error",
  })
  @ApiResponse({
    status: 429,
    description: "Too many estimator attempts. Please wait before trying again.",
  })
  async estimate(@Body() dto: QuoteEstimateDto): Promise<QuoteEstimateResponseDto> {
    return this.quotesService.estimate(dto);
  }

  /**
   * POST /api/v1/quotes
   * Public endpoint for submitting the custom quote wizard payload.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle(QUOTE_SUBMIT_THROTTLE)
  @ApiOperation({
    summary: "Submit custom quote request",
    description:
      "Submits full 4-step custom quote data from Path B. Public endpoint; no authentication required.",
  })
  @ApiResponse({
    status: 201,
    description: "Custom quote submitted successfully",
    type: CreateQuoteResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Validation error",
  })
  @ApiResponse({
    status: 429,
    description: "Too many quote submissions. Please wait before trying again.",
  })
  async create(
    @Body() dto: CreateQuoteDto,
    @Ip() ip: string,
    @Headers("accept-language") acceptLanguage: string | undefined,
    @Req() req: Request
  ): Promise<CreateQuoteResponseDto> {
    return this.quotesService.create(dto, {
      ip,
      acceptLanguage,
      nextLocale: this.extractNextLocale(req),
    });
  }

  /**
   * Extract NEXT_LOCALE cookie value for downstream i18n handling.
   */
  private extractNextLocale(req: Request): string | undefined {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return undefined;

    const nextLocaleCookie = cookieHeader
      .split(";")
      .map((segment) => segment.trim())
      .find((segment) => segment.startsWith("NEXT_LOCALE="));

    if (!nextLocaleCookie) return undefined;

    const value = nextLocaleCookie.slice("NEXT_LOCALE=".length).trim();
    if (!value) return undefined;

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
}
