import { Body, Controller, HttpCode, HttpStatus, Ip, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { ContactService } from "./contact.service.js";
import { CreateContactDto } from "./dto/create-contact.dto.js";
import { ReplyContactDto } from "./dto/reply-contact.dto.js";

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
  async reply(@Body() dto: ReplyContactDto) {
    return this.contactService.reply(dto);
  }
}
