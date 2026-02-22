import { z } from "zod";

// ==========================================
// Contact Form Schema — Source of Truth
// Shared between frontend & backend
// ==========================================

export const ContactSubjectEnum = z.enum([
  "GENERAL_INQUIRY",
  "CUSTOM_QUOTE",
  "PARTNERSHIP",
  "SUPPORT",
  "OTHER",
]);

export type ContactSubject = z.infer<typeof ContactSubjectEnum>;

/**
 * POST /api/v1/contact
 * Submit a contact form
 */
export const ContactFormSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be at most 100 characters"),
    email: z.string().email("Please enter a valid email address"),
    phone: z.string().max(20, "Phone number is too long").optional().or(z.literal("")),
    subject: ContactSubjectEnum,
    subjectOther: z
      .string()
      .max(100, "Subject must be at most 100 characters")
      .optional()
      .or(z.literal("")),
    message: z
      .string()
      .min(10, "Message must be at least 10 characters")
      .max(2000, "Message must be at most 2000 characters"),
    recaptchaToken: z.string().min(1, "reCAPTCHA verification failed"),
  })
  .refine(
    (data) => {
      if (data.subject === "OTHER") {
        return data.subjectOther && data.subjectOther.trim().length >= 2;
      }
      return true;
    },
    {
      message: "Please specify your subject",
      path: ["subjectOther"],
    }
  );

export type ContactFormInput = z.infer<typeof ContactFormSchema>;
