/**
 * DTO for contact form submissions.
 * Uses createZodDto() for compatibility with nestjs-zod's ZodValidationPipe.
 */
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const CreateContactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  subject: z.enum(["GENERAL_INQUIRY", "CUSTOM_QUOTE", "PARTNERSHIP", "SUPPORT", "OTHER"]),
  subjectOther: z.string().optional(),
  message: z.string().min(10).max(2000),
  recaptchaToken: z.string().min(1),
});

export class CreateContactDto extends createZodDto(CreateContactSchema) {}
