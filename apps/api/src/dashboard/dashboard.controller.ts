import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import { CreateQuoteDto, CreateQuoteResponseDto } from "../quotes/dto/quote.dto.js";
import { DashboardService } from "./dashboard.service.js";
import { DashboardOverviewResponseDto } from "./dto/dashboard.dto.js";
import {
  DashboardNewBookBankTransferResponseDto,
  DashboardNewBookOnlineResponseDto,
  DashboardNewBookOrderDto,
  DashboardNewBookPricingResponseDto,
} from "./dto/new-book.dto.js";

@ApiTags("Dashboard")
@Controller("dashboard")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard/overview
   * Authenticated dashboard summary for the main user dashboard route.
   */
  @Get("overview")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get current user's dashboard overview",
    description:
      "Returns the authenticated user's main dashboard overview payload, including " +
      "the active book, recent orders, unread notification state, profile completeness, and pending actions.",
  })
  @ApiResponse({
    status: 200,
    description: "Dashboard overview retrieved successfully",
    type: DashboardOverviewResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async getOverview(@CurrentUser("sub") userId: string): Promise<DashboardOverviewResponseDto> {
    return this.dashboardService.getUserDashboardOverview(userId);
  }

  /**
   * GET /api/v1/dashboard/new-book
   * Returns package categories + packages for the "Print a New Book" pricing page.
   */
  @Get("new-book")
  @Header("Cache-Control", "private, max-age=300")
  @ApiOperation({
    summary: "Get pricing data for new book order",
    description:
      "Returns the same package categories and packages as the public pricing page. " +
      "Used by the dashboard 'Print a New Book' feature.",
  })
  @ApiResponse({
    status: 200,
    description: "Pricing data retrieved successfully",
    type: DashboardNewBookPricingResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async getNewBookPricing(): Promise<DashboardNewBookPricingResponseDto> {
    return this.dashboardService.getNewBookPricing();
  }

  /**
   * POST /api/v1/dashboard/new-book/order
   * Authenticated user creates a new standard book order from the dashboard.
   * Skips the signup flow since the user already has an account.
   */
  @Post("new-book/order")
  @HttpCode(HttpStatus.OK)
  @ApiExtraModels(DashboardNewBookOnlineResponseDto, DashboardNewBookBankTransferResponseDto)
  @ApiOperation({
    summary: "Create a new book order from dashboard",
    description:
      "Initializes a payment for a new standard book order placed by an authenticated user. " +
      "For online payments (Paystack/Stripe/PayPal), returns a redirect URL. " +
      "For bank transfers, creates a pending payment record.",
  })
  @ApiResponse({
    status: 200,
    description: "Payment initialized or bank transfer submitted",
    schema: {
      oneOf: [
        { $ref: getSchemaPath(DashboardNewBookOnlineResponseDto) },
        { $ref: getSchemaPath(DashboardNewBookBankTransferResponseDto) },
      ],
    },
  })
  @ApiResponse({ status: 400, description: "Invalid package, configuration, or payment data" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async createNewBookOrder(
    @CurrentUser("sub") userId: string,
    @Body() dto: DashboardNewBookOrderDto
  ) {
    return this.dashboardService.createNewBookOrder(userId, dto);
  }

  /**
   * POST /api/v1/dashboard/new-book/quote
   * Authenticated user submits a custom quote from the dashboard.
   * Skips reCAPTCHA and links the quote to the user.
   */
  @Post("new-book/quote")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Submit a custom quote from the dashboard",
    description:
      "Submits a custom quote request for an authenticated user. " +
      "reCAPTCHA is not required. The quote is automatically linked to the user's account.",
  })
  @ApiResponse({
    status: 201,
    description: "Custom quote submitted successfully",
    type: CreateQuoteResponseDto,
  })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async submitDashboardQuote(
    @CurrentUser("sub") userId: string,
    @Body() dto: CreateQuoteDto,
    @Ip() ip: string,
    @Headers("accept-language") acceptLanguage: string | undefined
  ) {
    return this.dashboardService.submitDashboardQuote(userId, dto, {
      ip,
      acceptLanguage,
    });
  }
}
