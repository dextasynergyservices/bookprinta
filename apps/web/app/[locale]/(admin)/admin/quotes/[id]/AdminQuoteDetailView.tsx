"use client";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ClipboardCopy,
  Link2,
  Loader2,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  type FocusEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminDeleteQuoteMutation,
  useAdminGenerateQuotePaymentLinkMutation,
  useAdminQuotePatchMutation,
  useAdminRevokeQuotePaymentLinkMutation,
} from "@/hooks/useAdminQuoteActions";
import { useAdminQuoteDetail } from "@/hooks/useAdminQuoteDetail";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

type AdminQuoteDetailViewProps = {
  quoteId: string;
};

type IdentityConflictType =
  | "EMAIL_IN_USE"
  | "PHONE_IN_USE"
  | "EMAIL_PHONE_MISMATCH"
  | "DEACTIVATED_EMAIL"
  | null;

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

const DETAIL_WIZARD_SKELETON_IDS = [
  "quote-wizard-skeleton-1",
  "quote-wizard-skeleton-2",
  "quote-wizard-skeleton-3",
  "quote-wizard-skeleton-4",
] as const;

const DETAIL_SIDEBAR_SKELETON_IDS = [
  "quote-sidebar-skeleton-1",
  "quote-sidebar-skeleton-2",
  "quote-sidebar-skeleton-3",
] as const;

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatDateTime(
  value: string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (!value) return fallback;
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return fallback;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function formatCurrency(
  amount: number | null | undefined,
  locale: string,
  fallback: string
): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return fallback;

  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function detectIdentityConflictType(message: string): IdentityConflictType {
  const normalized = message.toLowerCase();

  if (normalized.includes("email and phone number belong to different accounts")) {
    return "EMAIL_PHONE_MISMATCH";
  }

  if (normalized.includes("phone number is already associated with an existing account")) {
    return "PHONE_IN_USE";
  }

  if (normalized.includes("email is already associated with an existing account")) {
    return "EMAIL_IN_USE";
  }

  if (normalized.includes("email belongs to a deactivated account")) {
    return "DEACTIVATED_EMAIL";
  }

  return null;
}

function parseNairaInput(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return parsed;
}

function humanizeToken(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

type DeleteEligibilityDetailQuote = {
  status: string;
  actions: {
    canDelete: boolean;
  };
  paymentLink: {
    displayStatus: string;
  };
};

function canDeleteQuoteFromDetail(quote: DeleteEligibilityDetailQuote | null): boolean {
  if (!quote) return false;
  if (quote.actions.canDelete) return true;

  if (quote.status === "PAID" || quote.status === "COMPLETED") {
    return false;
  }

  if (quote.status === "PENDING" || quote.status === "REJECTED") {
    return true;
  }

  return quote.paymentLink.displayStatus !== "SENT";
}

function InfoCard({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-[1.5rem] border border-[#1E1E1E] bg-[#111111] p-4 md:p-5", className)}
    >
      <div className="mb-4">
        {eyebrow ? (
          <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display mt-2 text-xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {description ? (
          <p className="font-sans mt-2 text-sm leading-6 text-[#AFAFAF]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#202020] bg-[#0B0B0B] p-3">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
        {label}
      </p>
      <p className="font-sans mt-2 text-sm leading-6 text-white [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function WizardStepCard({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4 md:p-5">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#7D7D7D]">
        {label}
      </p>
      <h3 className="font-display mt-2 text-lg font-semibold tracking-tight text-white">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function WizardFieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>;
}

function WizardField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#232323] bg-[#111111] p-3">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#8F8F8F]">
        {label}
      </p>
      <p className="font-sans mt-2 text-sm leading-6 text-white">{value}</p>
    </div>
  );
}

function TimelineChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 font-sans text-xs font-medium",
        active
          ? "border-[#007eff]/60 bg-[#007eff]/15 text-[#7bc0ff]"
          : "border-[#2A2A2A] bg-[#0F0F0F] text-[#8F8F8F]"
      )}
    >
      {label}
    </span>
  );
}

function DetailSkeleton() {
  return (
    <section className="grid min-w-0 gap-4">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <Skeleton className="h-4 w-28 rounded-full bg-[#1B1B1B]" />
        <Skeleton className="mt-4 h-10 w-56 rounded-full bg-[#1B1B1B]" />
        <Skeleton className="mt-3 h-5 w-full max-w-3xl bg-[#1B1B1B]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.95fr)]">
        <div className="grid gap-4">
          {DETAIL_WIZARD_SKELETON_IDS.map((skeletonId) => (
            <Skeleton key={skeletonId} className="h-52 rounded-[1.5rem] bg-[#171717]" />
          ))}
        </div>
        <div className="grid gap-4">
          {DETAIL_SIDEBAR_SKELETON_IDS.map((skeletonId) => (
            <Skeleton key={skeletonId} className="h-64 rounded-[1.5rem] bg-[#171717]" />
          ))}
        </div>
      </div>
    </section>
  );
}

async function copyText(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available.");
  }

  await navigator.clipboard.writeText(text);
}

export function AdminQuoteDetailView({ quoteId }: AdminQuoteDetailViewProps) {
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const detailQuery = useAdminQuoteDetail({
    quoteId,
    enabled: Boolean(quoteId),
  });
  const patchMutation = useAdminQuotePatchMutation();
  const contactPatchMutation = useAdminQuotePatchMutation();
  const generateMutation = useAdminGenerateQuotePaymentLinkMutation();
  const revokeMutation = useAdminRevokeQuotePaymentLinkMutation();
  const deleteMutation = useAdminDeleteQuoteMutation();

  const quote = detailQuery.quote;

  const [notesDraft, setNotesDraft] = useState("");
  const [isNotesFocused, setIsNotesFocused] = useState(false);
  const [finalPriceDraft, setFinalPriceDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [revokeCustomerMessage, setRevokeCustomerMessage] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [identityConflictType, setIdentityConflictType] = useState<IdentityConflictType>(null);
  const [identityConflictMessage, setIdentityConflictMessage] = useState<string | null>(null);
  const skipNextNotesSyncRef = useRef(false);

  useEffect(() => {
    if (skipNextNotesSyncRef.current) {
      skipNextNotesSyncRef.current = false;
      return;
    }

    if (!quote || isNotesFocused) return;
    setNotesDraft(quote.adminNotes ?? "");
  }, [quote, isNotesFocused]);

  useEffect(() => {
    if (!quote) return;
    setFinalPriceDraft(quote.finalPrice ? String(quote.finalPrice) : "");
    setEmailDraft(quote.contact.email);
    setPhoneDraft(quote.contact.phone);
  }, [quote]);

  const parsedFinalPrice = useMemo(() => parseNairaInput(finalPriceDraft), [finalPriceDraft]);

  const estimateLabel = useMemo(() => {
    if (!quote) return "";

    if (quote.estimate.mode === "MANUAL_REQUIRED") {
      return tAdmin("quotes_estimate_manual");
    }

    return quote.estimate.label;
  }, [quote, tAdmin]);

  const linkDisplayStatus = quote?.paymentLink.displayStatus ?? "NOT_SENT";
  const hasGeneratedLink = Boolean(quote?.paymentLink.url);
  const canRevoke = Boolean(
    quote?.paymentLink.token &&
      (quote.paymentLink.displayStatus === "SENT" || quote.paymentLink.displayStatus === "EXPIRED")
  );
  const hasContactChanges = Boolean(
    quote &&
      (emailDraft.trim().toLowerCase() !== quote.contact.email.toLowerCase() ||
        phoneDraft.trim() !== quote.contact.phone)
  );
  const canDeleteQuote = canDeleteQuoteFromDetail(quote);
  const canSubmitDelete =
    canDeleteQuote &&
    deleteReason.trim().length >= 5 &&
    deleteConfirmText.trim() === "DELETE" &&
    !deleteMutation.isPending;

  async function handleNotesBlur(_event: FocusEvent<HTMLTextAreaElement>) {
    if (!quote) return;

    skipNextNotesSyncRef.current = true;
    setIsNotesFocused(false);
    const currentValue = quote.adminNotes ?? "";
    const nextValue = notesDraft.trim();
    const normalizedNext = nextValue.length > 0 ? nextValue : null;
    const normalizedCurrent = currentValue.trim().length > 0 ? currentValue : null;

    if (normalizedNext === normalizedCurrent) {
      return;
    }

    try {
      await patchMutation.mutateAsync({
        quoteId,
        input: {
          adminNotes: normalizedNext,
        },
      });

      toast.success(tAdmin("quotes_detail_notes_saved"));
    } catch (error) {
      setNotesDraft(currentValue);
      toast.error(tAdmin("quotes_detail_notes_error_title"), {
        description: getErrorMessage(error, tAdmin("quotes_detail_notes_error_description")),
      });
    }
  }

  async function handleGenerateLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!parsedFinalPrice) {
      toast.error(tAdmin("quotes_detail_generate_invalid_price_title"), {
        description: tAdmin("quotes_detail_generate_invalid_price_description"),
      });
      return;
    }

    try {
      const response = await generateMutation.mutateAsync({
        quoteId,
        input: {
          finalPrice: parsedFinalPrice,
        },
      });

      setFinalPriceDraft(String(parsedFinalPrice));
      setIdentityConflictType(null);
      setIdentityConflictMessage(null);

      toast.success(tAdmin("quotes_detail_generate_success_title"), {
        description: tAdmin("quotes_detail_generate_success_description", {
          status: response.paymentLink.displayStatus,
        }),
      });
    } catch (error) {
      const message = getErrorMessage(error, tAdmin("quotes_detail_generate_error_description"));
      const conflictType = detectIdentityConflictType(message);

      if (conflictType) {
        setIdentityConflictType(conflictType);
        setIdentityConflictMessage(message);
      }

      toast.error(tAdmin("quotes_detail_generate_error_title"), {
        description: message,
      });
    }
  }

  async function handleCopyPaymentLink() {
    if (!quote?.paymentLink.url) return;

    try {
      await copyText(quote.paymentLink.url);
      toast.success(tAdmin("quotes_detail_copy_success"));
    } catch (error) {
      toast.error(tAdmin("quotes_detail_copy_error_title"), {
        description: getErrorMessage(error, tAdmin("quotes_detail_copy_error_description")),
      });
    }
  }

  async function handleRevokePaymentLink() {
    if (!canRevoke) return;

    const normalizedReason = revokeReason.trim();
    if (normalizedReason.length < 5) {
      toast.error(tAdmin("quotes_detail_revoke_reason_required_title"), {
        description: tAdmin("quotes_detail_revoke_reason_required_description"),
      });
      return;
    }

    try {
      const response = await revokeMutation.mutateAsync({
        quoteId,
        input: {
          reason: normalizedReason,
          notifyCustomer,
          customerMessage:
            revokeCustomerMessage.trim().length > 0 ? revokeCustomerMessage.trim() : null,
        },
      });

      setRevokeReason("");
      setNotifyCustomer(false);
      setRevokeCustomerMessage("");

      toast.success(tAdmin("quotes_detail_revoke_success_title"));

      if (notifyCustomer) {
        if (response.delivery.email.delivered) {
          toast.success(tAdmin("quotes_detail_revoke_email_success_title"));
        } else if (response.delivery.email.attempted) {
          toast.error(tAdmin("quotes_detail_revoke_email_error_title"), {
            description:
              response.delivery.email.failureReason ||
              tAdmin("quotes_detail_revoke_email_error_description"),
          });
        }
      }
    } catch (error) {
      toast.error(tAdmin("quotes_detail_revoke_error_title"), {
        description: getErrorMessage(error, tAdmin("quotes_detail_revoke_error_description")),
      });
    }
  }

  async function handleSaveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || !hasContactChanges) return;

    const normalizedEmail = emailDraft.trim().toLowerCase();
    const normalizedPhone = phoneDraft.trim();

    if (!normalizedEmail || !normalizedPhone) {
      toast.error(tAdmin("quotes_detail_contact_validation_title"), {
        description: tAdmin("quotes_detail_contact_validation_description"),
      });
      return;
    }

    try {
      await contactPatchMutation.mutateAsync({
        quoteId,
        input: {
          email: normalizedEmail,
          phone: normalizedPhone,
        },
      });

      setIdentityConflictType(null);
      setIdentityConflictMessage(null);
      toast.success(tAdmin("quotes_detail_contact_saved_title"));
    } catch (error) {
      const message = getErrorMessage(error, tAdmin("quotes_detail_contact_error_description"));
      const conflictType = detectIdentityConflictType(message);

      if (conflictType) {
        setIdentityConflictType(conflictType);
        setIdentityConflictMessage(message);
      }

      toast.error(tAdmin("quotes_detail_contact_error_title"), {
        description: message,
      });
    }
  }

  async function handleDeleteQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canDeleteQuote) return;

    const reason = deleteReason.trim();
    if (reason.length < 5 || deleteConfirmText.trim() !== "DELETE") {
      return;
    }

    try {
      await deleteMutation.mutateAsync({
        quoteId,
        input: {
          reason,
          confirmText: "DELETE",
        },
      });

      toast.success(tAdmin("quotes_action_delete"));
      router.replace("/admin/quotes");
    } catch (error) {
      toast.error(getErrorMessage(error, tAdmin("quotes_error_description")));
    }
  }

  if (detailQuery.isInitialLoading) {
    return <DetailSkeleton />;
  }

  if (detailQuery.isError || !quote) {
    return (
      <section className="grid min-w-0 gap-4">
        <div className="rounded-[1.75rem] border border-[#4A1616] bg-[linear-gradient(180deg,#160707_0%,#0C0A0A_100%)] p-6 md:p-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 size-5 shrink-0 text-[#ff6b6b]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-display text-2xl font-semibold tracking-tight text-white">
                {tAdmin("quotes_detail_error_title")}
              </p>
              <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#FFC5C5]">
                {detailQuery.error instanceof Error && detailQuery.error.message
                  ? detailQuery.error.message
                  : tAdmin("quotes_detail_error_description")}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => detailQuery.refetch()}
                  className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8]"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {tAdmin("quotes_detail_refetch")}
                </Button>
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-full border-[#2A2A2A] bg-[#111111] px-5 font-sans text-sm text-white hover:border-[#3A3A3A] hover:bg-[#181818]"
                >
                  <Link href="/admin/quotes">
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {tAdmin("quotes_back_to_list")}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="grid min-w-0 gap-4"
    >
      <header className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <Button
              asChild
              type="button"
              variant="ghost"
              className="h-auto rounded-full border border-[#202020] bg-[#0C0C0C] px-4 py-2 font-sans text-xs font-medium uppercase tracking-[0.08em] text-[#C9C9C9] hover:bg-[#111111]"
            >
              <Link href="/admin/quotes">
                <ArrowLeft className="size-4" aria-hidden="true" />
                {tAdmin("quotes_back_to_list")}
              </Link>
            </Button>

            <p className="font-sans mt-4 text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
              {tAdmin("panel_label")}
            </p>
            <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
              {quote.manuscript.workingTitle}
            </h1>
            <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
              {tAdmin("quotes_detail_description")}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <TimelineChip
                label={tAdmin("quotes_timeline_sent")}
                active={linkDisplayStatus === "SENT"}
              />
              <TimelineChip
                label={tAdmin("quotes_timeline_expired")}
                active={linkDisplayStatus === "EXPIRED"}
              />
              <TimelineChip
                label={tAdmin("quotes_timeline_paid")}
                active={linkDisplayStatus === "PAID"}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:max-w-[24rem]">
            <DetailValue
              label={tAdmin("quotes_table_created")}
              value={formatDateTime(quote.createdAt, locale, tAdmin("quotes_date_unavailable"))}
            />
            <DetailValue
              label={tAdmin("users_detail_updated")}
              value={formatDateTime(quote.updatedAt, locale, tAdmin("quotes_date_unavailable"))}
            />
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.95fr)]">
        <div className="grid gap-4">
          <InfoCard
            eyebrow={tAdmin("quotes_detail_wizard_eyebrow")}
            title={tAdmin("quotes_detail_wizard_title")}
            description={tAdmin("quotes_detail_wizard_description")}
          >
            <div className="grid gap-3">
              <WizardStepCard
                label={tAdmin("quotes_detail_step_1_label")}
                title={tAdmin("quotes_detail_step_1_title")}
              >
                <WizardFieldGrid>
                  <WizardField
                    label={tAdmin("quotes_detail_field_working_title")}
                    value={quote.manuscript.workingTitle}
                  />
                  <WizardField
                    label={tAdmin("quotes_detail_field_word_count")}
                    value={String(quote.manuscript.estimatedWordCount)}
                  />
                </WizardFieldGrid>
              </WizardStepCard>

              <WizardStepCard
                label={tAdmin("quotes_detail_step_2_label")}
                title={tAdmin("quotes_detail_step_2_title")}
              >
                <WizardFieldGrid>
                  <WizardField
                    label={tAdmin("quotes_detail_field_print_size")}
                    value={quote.print.bookPrintSize}
                  />
                  <WizardField
                    label={tAdmin("quotes_detail_field_quantity")}
                    value={String(quote.print.quantity)}
                  />
                  <WizardField
                    label={tAdmin("quotes_detail_field_cover_type")}
                    value={humanizeToken(quote.print.coverType)}
                  />
                </WizardFieldGrid>
              </WizardStepCard>

              <WizardStepCard
                label={tAdmin("quotes_detail_step_3_label")}
                title={tAdmin("quotes_detail_step_3_title")}
              >
                <WizardFieldGrid>
                  <WizardField
                    label={tAdmin("quotes_detail_field_has_special_reqs")}
                    value={
                      quote.specialRequirements.hasSpecialReqs
                        ? tAdmin("quotes_detail_yes")
                        : tAdmin("quotes_detail_no")
                    }
                  />
                  <WizardField
                    label={tAdmin("quotes_detail_field_special_reqs")}
                    value={
                      quote.specialRequirements.specialReqs.length > 0
                        ? quote.specialRequirements.specialReqs.map(humanizeToken).join(", ")
                        : tAdmin("quotes_detail_none")
                    }
                  />
                  <WizardField
                    label={tAdmin("quotes_detail_field_special_reqs_other")}
                    value={
                      quote.specialRequirements.specialReqsOther || tAdmin("quotes_detail_none")
                    }
                  />
                </WizardFieldGrid>
              </WizardStepCard>

              <WizardStepCard
                label={tAdmin("quotes_detail_step_4_label")}
                title={tAdmin("quotes_detail_step_4_title")}
              >
                <WizardFieldGrid>
                  <WizardField
                    label={tAdmin("quotes_table_customer")}
                    value={quote.contact.fullName}
                  />
                  <WizardField label={tAdmin("quotes_table_email")} value={quote.contact.email} />
                  <WizardField
                    label={tAdmin("quotes_detail_field_phone")}
                    value={quote.contact.phone}
                  />
                </WizardFieldGrid>
              </WizardStepCard>
            </div>
          </InfoCard>

          <InfoCard
            eyebrow={tAdmin("quotes_table_estimate")}
            title={tAdmin("quotes_detail_estimate_title")}
            description={tAdmin("quotes_detail_estimate_description")}
          >
            <div className="rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4">
              <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
                {estimateLabel}
              </p>
            </div>
          </InfoCard>
        </div>

        <div className="grid gap-4">
          <InfoCard
            eyebrow={tAdmin("quotes_detail_contact_eyebrow")}
            title={tAdmin("quotes_detail_contact_title")}
            description={tAdmin("quotes_detail_contact_description")}
          >
            <form className="grid gap-3" onSubmit={handleSaveContact}>
              <label
                htmlFor="quote-contact-email"
                className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#8F8F8F]"
              >
                {tAdmin("quotes_table_email")}
              </label>
              <Input
                id="quote-contact-email"
                type="email"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                className="min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 font-sans text-sm text-white"
              />

              <label
                htmlFor="quote-contact-phone"
                className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#8F8F8F]"
              >
                {tAdmin("quotes_detail_field_phone")}
              </label>
              <Input
                id="quote-contact-phone"
                value={phoneDraft}
                onChange={(event) => setPhoneDraft(event.target.value)}
                className="min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 font-sans text-sm text-white"
              />

              <Button
                type="submit"
                disabled={!hasContactChanges || contactPatchMutation.isPending}
                aria-busy={contactPatchMutation.isPending}
                className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8] disabled:opacity-50"
              >
                {contactPatchMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {tAdmin("quotes_detail_contact_saving")}
                  </>
                ) : (
                  tAdmin("quotes_detail_contact_save")
                )}
              </Button>
            </form>
          </InfoCard>

          <InfoCard
            eyebrow={tAdmin("quotes_detail_notes_eyebrow")}
            title={tAdmin("quotes_detail_notes_title")}
            description={tAdmin("quotes_detail_notes_description")}
          >
            <Textarea
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              onFocus={() => setIsNotesFocused(true)}
              onBlur={handleNotesBlur}
              placeholder={tAdmin("quotes_detail_notes_placeholder")}
              aria-label={tAdmin("quotes_detail_notes_title")}
              className="min-h-[9rem] resize-y rounded-2xl border-[#2A2A2A] bg-[#0B0B0B] px-4 py-3 font-sans text-sm text-white placeholder:text-[#777]"
            />
            {patchMutation.isPending ? (
              <output
                aria-live="polite"
                className="mt-2 inline-flex items-center gap-2 font-sans text-xs text-[#7bb9ff]"
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {tAdmin("quotes_detail_notes_saving")}
              </output>
            ) : null}
          </InfoCard>

          <InfoCard
            eyebrow={tAdmin("quotes_detail_payment_link_eyebrow")}
            title={tAdmin("quotes_detail_payment_link_title")}
            description={tAdmin("quotes_detail_payment_link_description")}
          >
            <form className="grid gap-3" onSubmit={handleGenerateLink}>
              <label
                htmlFor="quote-final-price"
                className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#8F8F8F]"
              >
                {tAdmin("quotes_detail_final_price_label")}
              </label>
              <Input
                id="quote-final-price"
                inputMode="numeric"
                value={finalPriceDraft}
                onChange={(event) => setFinalPriceDraft(event.target.value)}
                placeholder={tAdmin("quotes_detail_final_price_placeholder")}
                className="min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 font-sans text-sm text-white"
              />

              <p className="font-sans text-xs text-[#9A9A9A]">
                {parsedFinalPrice
                  ? formatCurrency(parsedFinalPrice, locale, tAdmin("quotes_detail_invalid_price"))
                  : tAdmin("quotes_detail_invalid_price")}
              </p>

              <Button
                type="submit"
                disabled={generateMutation.isPending || !parsedFinalPrice}
                aria-busy={generateMutation.isPending}
                className="min-h-11 rounded-full bg-[#007eff] px-5 font-sans text-sm font-medium text-white hover:bg-[#0068d8] disabled:opacity-50"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {tAdmin("quotes_detail_generate_loading")}
                  </>
                ) : (
                  <>
                    <Send className="size-4" aria-hidden="true" />
                    {tAdmin("quotes_detail_generate_button")}
                  </>
                )}
              </Button>
            </form>

            {identityConflictType ? (
              <div className="mt-4 rounded-[1.15rem] border border-[#7a5f1a]/45 bg-[#2a210d] p-4">
                <p className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-[#f4d38a]">
                  {tAdmin("quotes_detail_identity_conflict_title")}
                </p>
                <p className="font-sans mt-2 text-sm leading-6 text-[#f3e2bb]">
                  {tAdmin("quotes_detail_identity_conflict_description")}
                </p>
                <p className="font-sans mt-2 text-xs leading-5 text-[#f4d38a]">
                  {tAdmin("quotes_detail_identity_conflict_email_hint")}
                </p>
                <p className="font-sans mt-1 text-xs leading-5 text-[#f4d38a]">
                  {tAdmin("quotes_detail_identity_conflict_phone_hint")}
                </p>
                <p className="font-sans mt-1 text-xs leading-5 text-[#f4d38a]">
                  {tAdmin("quotes_detail_identity_conflict_both_hint")}
                </p>
                <p className="font-sans mt-2 text-xs text-[#f4d38a]">
                  {tAdmin("quotes_detail_identity_conflict_action")}
                </p>

                <div className="mt-3 rounded-lg border border-[#f4d38a]/45 bg-[#3d2f12] p-3">
                  <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-[#ffe3a8]">
                    {tAdmin("quotes_detail_identity_conflict_detected_label")}
                  </p>
                  <p className="font-sans mt-1 text-sm text-[#fff0cd]">
                    {identityConflictType === "EMAIL_IN_USE"
                      ? tAdmin("quotes_detail_identity_conflict_detected_email")
                      : identityConflictType === "PHONE_IN_USE"
                        ? tAdmin("quotes_detail_identity_conflict_detected_phone")
                        : identityConflictType === "DEACTIVATED_EMAIL"
                          ? tAdmin("quotes_detail_identity_conflict_detected_deactivated_email")
                          : tAdmin("quotes_detail_identity_conflict_detected_both")}
                  </p>
                  {identityConflictMessage ? (
                    <p className="font-sans mt-2 text-xs text-[#f4d38a]">
                      {identityConflictMessage}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasGeneratedLink ? (
              <div className="mt-4 grid gap-3 rounded-[1.25rem] border border-[#202020] bg-[#0B0B0B] p-4">
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#8F8F8F]">
                  {tAdmin("quotes_detail_generated_url_label")}
                </p>
                <a
                  href={quote.paymentLink.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans inline-flex items-center gap-2 text-sm text-[#7bc0ff] hover:text-[#a6d6ff]"
                >
                  <Link2 className="size-4" aria-hidden="true" />
                  <span className="truncate">{quote.paymentLink.url}</span>
                </a>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopyPaymentLink}
                    aria-label={tAdmin("quotes_detail_copy_button")}
                    className="min-h-10 rounded-full border-[#2A2A2A] bg-[#111111] px-4 font-sans text-xs text-white"
                  >
                    <ClipboardCopy className="size-4" aria-hidden="true" />
                    {tAdmin("quotes_detail_copy_button")}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRevokePaymentLink}
                    disabled={!canRevoke || revokeMutation.isPending}
                    aria-busy={revokeMutation.isPending}
                    className="min-h-10 rounded-full border-[#4A1616] bg-[#1A0B0B] px-4 font-sans text-xs text-[#ffc5c5] hover:bg-[#220f0f] disabled:opacity-50"
                  >
                    {revokeMutation.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {tAdmin("quotes_detail_revoke_loading")}
                      </>
                    ) : (
                      <>
                        <Undo2 className="size-4" aria-hidden="true" />
                        {tAdmin("quotes_detail_revoke_button")}
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid gap-3 rounded-xl border border-[#2A2A2A] bg-[#111111] p-3">
                  <label
                    htmlFor="quote-revoke-reason"
                    className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#8F8F8F]"
                  >
                    {tAdmin("quotes_detail_revoke_reason_label")}
                  </label>
                  <Textarea
                    id="quote-revoke-reason"
                    value={revokeReason}
                    onChange={(event) => setRevokeReason(event.target.value)}
                    placeholder={tAdmin("quotes_detail_revoke_reason_placeholder")}
                    className="min-h-20 resize-y rounded-xl border-[#2A2A2A] bg-[#0B0B0B] px-3 py-2 font-sans text-sm text-white placeholder:text-[#777]"
                  />

                  <label
                    htmlFor="quote-revoke-notify"
                    className="flex items-center gap-2 font-sans text-sm text-[#D3D3D3]"
                  >
                    <Checkbox
                      id="quote-revoke-notify"
                      checked={notifyCustomer}
                      onCheckedChange={(checked) => setNotifyCustomer(checked === true)}
                      className="border-[#3A3A3A] data-[state=checked]:border-[#007eff] data-[state=checked]:bg-[#007eff]"
                    />
                    {tAdmin("quotes_detail_revoke_notify_customer")}
                  </label>

                  {notifyCustomer ? (
                    <>
                      <label
                        htmlFor="quote-revoke-customer-message"
                        className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#8F8F8F]"
                      >
                        {tAdmin("quotes_detail_revoke_customer_message_label")}
                      </label>
                      <Textarea
                        id="quote-revoke-customer-message"
                        value={revokeCustomerMessage}
                        onChange={(event) => setRevokeCustomerMessage(event.target.value)}
                        placeholder={tAdmin("quotes_detail_revoke_customer_message_placeholder")}
                        className="min-h-20 resize-y rounded-xl border-[#2A2A2A] bg-[#0B0B0B] px-3 py-2 font-sans text-sm text-white placeholder:text-[#777]"
                      />
                    </>
                  ) : null}
                </div>

                <p className="font-sans text-xs text-[#8F8F8F]">
                  {tAdmin("quotes_detail_expires_label")}{" "}
                  {formatDateTime(
                    quote.paymentLink.expiresAt,
                    locale,
                    tAdmin("quotes_date_unavailable")
                  )}
                </p>
              </div>
            ) : null}

            {canDeleteQuote ? (
              <div className="mt-4 rounded-[1.25rem] border border-[#4A1616] bg-[#120A0A] p-4">
                <p className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#ffb3b3]">
                  {tAdmin("quotes_delete_dialog_title")}
                </p>
                <p className="font-sans mt-2 text-sm leading-6 text-[#ffcfcf]">
                  {tAdmin("quotes_delete_dialog_description")}
                </p>

                <form className="mt-3 grid gap-3" onSubmit={handleDeleteQuote}>
                  <label
                    htmlFor="quote-delete-reason"
                    className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#8F8F8F]"
                  >
                    {tAdmin("quotes_dialog_reason_label")}
                  </label>
                  <Textarea
                    id="quote-delete-reason"
                    value={deleteReason}
                    onChange={(event) => setDeleteReason(event.target.value)}
                    placeholder={tAdmin("quotes_dialog_reason_placeholder")}
                    className="min-h-20 resize-y rounded-xl border-[#2A2A2A] bg-[#0B0B0B] px-3 py-2 font-sans text-sm text-white placeholder:text-[#777]"
                  />

                  <label
                    htmlFor="quote-delete-confirm"
                    className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-[#8F8F8F]"
                  >
                    {tAdmin("quotes_delete_dialog_confirm_label")}
                  </label>
                  <Input
                    id="quote-delete-confirm"
                    value={deleteConfirmText}
                    onChange={(event) => setDeleteConfirmText(event.target.value)}
                    placeholder="DELETE"
                    className="min-h-11 rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-4 font-sans text-sm text-white"
                  />

                  <Button
                    type="submit"
                    disabled={!canSubmitDelete}
                    aria-busy={deleteMutation.isPending}
                    className="min-h-11 rounded-full bg-[#A32020] px-5 font-sans text-sm font-medium text-white hover:bg-[#8d1a1a] disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        {tAdmin("quotes_detail_revoke_loading")}
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-4" aria-hidden="true" />
                        {tAdmin("quotes_action_delete")}
                      </>
                    )}
                  </Button>
                </form>
              </div>
            ) : null}
          </InfoCard>
        </div>
      </div>
    </motion.section>
  );
}
