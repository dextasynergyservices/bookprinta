import { Body, Controller, HttpCode, HttpStatus, Ip, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { ContactService } from "./contact.service.js";
import { CreateContactDto } from "./dto/create-contact.dto.js";
import { ReplyContactDto } from "./dto/reply-contact.dto.js";

@ApiTags("Contact")
@Controller("contact")
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /**
   * POST /api/v1/contact
   * Submit a contact form (public — no auth required)
   * Rate limited via Redis: 3 per IP per hour
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Submit contact form",
    description:
      "Public endpoint for contact form submissions. Rate limited to 3 per IP per hour via Redis. " +
      "Requires a valid reCAPTCHA v3 token. Sends confirmation email to the user and notification to admin.",
  })
  @ApiResponse({ status: 201, description: "Contact form submitted successfully" })
  @ApiResponse({ status: 400, description: "Validation error (invalid fields or reCAPTCHA)" })
  @ApiResponse({ status: 429, description: "Rate limit exceeded (3 submissions per hour per IP)" })
  async create(@Body() dto: CreateContactDto, @Ip() ip: string) {
    return this.contactService.create(dto, ip);
  }

  /**
   * POST /api/v1/contact/reply
   * Admin replies to a contact submission (auth required — ADMIN/SUPER_ADMIN only)
   */
  @Post("reply")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Reply to contact submission",
    description:
      "Admin-only endpoint. Sends an email reply to the user who submitted the contact form. " +
      "Requires ADMIN or SUPER_ADMIN role.",
  })
  @ApiResponse({ status: 200, description: "Reply sent successfully" })
  @ApiResponse({ status: 401, description: "Unauthorized — JWT required" })
  @ApiResponse({ status: 403, description: "Forbidden — ADMIN or SUPER_ADMIN role required" })
  @ApiResponse({ status: 404, description: "Contact submission not found" })
  async reply(@Body() dto: ReplyContactDto) {
    return this.contactService.reply(dto);
  }
}
