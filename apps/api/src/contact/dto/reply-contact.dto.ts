/**
 * DTO for admin reply to a contact form submission.
 * Uses createZodDto() for compatibility with nestjs-zod's ZodValidationPipe.
 */
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const ReplyContactSchema = z.object({
  submissionId: z.string().uuid(),
  replyMessage: z.string().min(1).max(5000),
  replySubject: z.string().optional(),
});

export class ReplyContactDto extends createZodDto(ReplyContactSchema) {}
