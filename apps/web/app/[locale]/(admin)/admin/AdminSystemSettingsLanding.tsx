"use client";

import type {
  AdminSystemGatewayCredentialField,
  AdminSystemPaymentGateway,
  AdminSystemSettingKey,
  ProductionDelayOverrideState,
} from "@bookprinta/shared";
import { AlertCircle, Eye, EyeOff, Loader2, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  normalizeAdminSettingsError,
  useAdminProductionStatus,
  useAdminSettingsUnsavedChanges,
  useAdminSystemPaymentGateways,
  useAdminSystemSettings,
  useUpdateAdminProductionDelayOverrideMutation,
  useUpdateAdminSystemPaymentGatewayMutation,
  useUpdateAdminSystemSettingMutation,
} from "@/hooks/useAdminSettings";

type SocialLinkDraft = {
  label: string;
  url: string;
};

type BusinessDraft = {
  websiteUrl: string;
  supportEmail: string;
  supportPhone: string;
  whatsappNumber: string;
  officeAddress: string;
  socialLinks: SocialLinkDraft[];
};

type QuotePricingDraft = {
  quoteCostPerPage: string;
  quoteCoverCost: string;
  reprintA4: string;
  reprintA5: string;
  reprintA6: string;
  minimumCopies: string;
};

type WhatsappToggleDraft = {
  key: string;
  enabled: boolean;
};

type NotificationDraft = {
  senderName: string;
  senderEmail: string;
  escalationRecipients: string[];
  whatsappToggles: WhatsappToggleDraft[];
};

type OperationalDraft = {
  maintenanceMode: boolean;
  backlogThreshold: string;
  delayOverrideState: ProductionDelayOverrideState;
  delayNotes: string;
};

type AboutSectionDraft = {
  title: string;
  body: string;
};

type FaqEntryDraft = {
  question: string;
  answer: string;
};

type ContentDraft = {
  aboutHeading: string;
  aboutSummary: string;
  aboutSections: AboutSectionDraft[];
  contactHeading: string;
  contactEmail: string;
  contactPhone: string;
  contactWhatsapp: string;
  contactAddress: string;
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  faqEntries: FaqEntryDraft[];
};

type SeoDraft = {
  canonicalBaseUrl: string;
  ogFallbackImageUrl: string;
  titleTemplate: string;
  defaultDescription: string;
  defaultRobots: "index,follow" | "noindex,nofollow";
};

type PaymentGatewayDraft = {
  id: string;
  name: string;
  provider: string;
  isEnabled: boolean;
  isTestMode: boolean;
  priority: string;
  instructions: string;
  credentials: Array<{
    field: AdminSystemGatewayCredentialField;
    label: string;
    maskedValue: string | null;
    isConfigured: boolean;
    nextValue: string;
  }>;
};

type FieldErrors = Record<string, string>;

const SECTION_PAYMENT_GATEWAYS = "payment_gateways";
const SECTION_BUSINESS_PROFILE = "business_profile";
const SECTION_QUOTE_PRICING = "quote_pricing";
const SECTION_NOTIFICATION_COMMS = "notification_comms";
const SECTION_OPERATIONAL = "operational";
const SECTION_CONTENT_CONTROLS = "content_controls";
const SECTION_SEO_CONTROLS = "seo_controls";

const ALLOWED_SYSTEM_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

const SETTING_KEYS: Record<string, AdminSystemSettingKey> = {
  business_website_url: "business_website_url",
  business_support_email: "business_support_email",
  business_support_phone: "business_support_phone",
  business_whatsapp_number: "business_whatsapp_number",
  business_office_address: "business_office_address",
  business_social_links: "business_social_links",
  quote_cost_per_page: "quote_cost_per_page",
  quote_cover_cost: "quote_cover_cost",
  reprint_cost_per_page_a4: "reprint_cost_per_page_a4",
  reprint_cost_per_page_a5: "reprint_cost_per_page_a5",
  reprint_cost_per_page_a6: "reprint_cost_per_page_a6",
  reprint_minimum_copies: "reprint_minimum_copies",
  comms_sender_name: "comms_sender_name",
  comms_sender_email: "comms_sender_email",
  comms_whatsapp_template_toggles: "comms_whatsapp_template_toggles",
  comms_escalation_recipients: "comms_escalation_recipients",
  maintenance_mode: "maintenance_mode",
  production_backlog_threshold: "production_backlog_threshold",
  content_about_blocks: "content_about_blocks",
  content_contact_blocks: "content_contact_blocks",
  content_faq_entries: "content_faq_entries",
  content_homepage_hero_copy: "content_homepage_hero_copy",
  seo_metadata_defaults: "seo_metadata_defaults",
  seo_og_fallback_image_url: "seo_og_fallback_image_url",
  seo_canonical_base_url: "seo_canonical_base_url",
};

function toMoney(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "0";
}

function toInteger(value: unknown, fallback = 0): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return String(fallback);
}

function toStringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  return fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function formatNgn(locale: string, rawAmount: string): string {
  const amount = Number.parseFloat(rawAmount);
  if (!Number.isFinite(amount)) {
    return "--";
  }

  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(amount);
}

function normalizeSocialLinks(value: unknown): SocialLinkDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const label = toStringValue((entry as { label?: unknown }).label).trim();
      const url = toStringValue((entry as { url?: unknown }).url).trim();
      return { label, url };
    })
    .filter((entry): entry is SocialLinkDraft => Boolean(entry));
}

function normalizeToggles(value: unknown): WhatsappToggleDraft[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).map(([key, enabled]) => ({
    key,
    enabled: Boolean(enabled),
  }));
}

function normalizeAboutBlocks(value: unknown): {
  heading: string;
  summary: string;
  sections: AboutSectionDraft[];
} {
  if (!value || typeof value !== "object") {
    return { heading: "", summary: "", sections: [] };
  }

  const record = value as {
    heading?: unknown;
    summary?: unknown;
    sections?: unknown;
  };

  const sections = Array.isArray(record.sections)
    ? record.sections
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          return {
            title: toStringValue((entry as { title?: unknown }).title),
            body: toStringValue((entry as { body?: unknown }).body),
          };
        })
        .filter((entry): entry is AboutSectionDraft => Boolean(entry))
    : [];

  return {
    heading: toStringValue(record.heading),
    summary: toStringValue(record.summary),
    sections,
  };
}

function normalizeContactBlocks(value: unknown): {
  heading: string;
  supportEmail: string;
  supportPhone: string;
  whatsappNumber: string;
  officeAddress: string;
} {
  if (!value || typeof value !== "object") {
    return {
      heading: "",
      supportEmail: "",
      supportPhone: "",
      whatsappNumber: "",
      officeAddress: "",
    };
  }

  const record = value as Record<string, unknown>;
  return {
    heading: toStringValue(record.heading),
    supportEmail: toStringValue(record.supportEmail),
    supportPhone: toStringValue(record.supportPhone),
    whatsappNumber: toStringValue(record.whatsappNumber),
    officeAddress: toStringValue(record.officeAddress),
  };
}

function normalizeHeroCopy(value: unknown): {
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
} {
  if (!value || typeof value !== "object") {
    return {
      title: "",
      subtitle: "",
      primaryCtaLabel: "",
      secondaryCtaLabel: "",
    };
  }

  const record = value as Record<string, unknown>;
  return {
    title: toStringValue(record.title),
    subtitle: toStringValue(record.subtitle),
    primaryCtaLabel: toStringValue(record.primaryCtaLabel),
    secondaryCtaLabel: toStringValue(record.secondaryCtaLabel),
  };
}

function normalizeFaqEntries(value: unknown): FaqEntryDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      return {
        question: toStringValue((entry as { question?: unknown }).question),
        answer: toStringValue((entry as { answer?: unknown }).answer),
      };
    })
    .filter((entry): entry is FaqEntryDraft => Boolean(entry));
}

function normalizeSeoDefaults(value: unknown): {
  titleTemplate: string;
  defaultDescription: string;
  defaultRobots: "index,follow" | "noindex,nofollow";
} {
  if (!value || typeof value !== "object") {
    return {
      titleTemplate: "%s | BookPrinta",
      defaultDescription: "",
      defaultRobots: "index,follow",
    };
  }

  const record = value as Record<string, unknown>;
  const robots =
    toStringValue(record.defaultRobots) === "noindex,nofollow"
      ? "noindex,nofollow"
      : "index,follow";

  return {
    titleTemplate: toStringValue(record.titleTemplate, "%s | BookPrinta"),
    defaultDescription: toStringValue(record.defaultDescription),
    defaultRobots: robots,
  };
}

function buildGatewayDraft(gateway: AdminSystemPaymentGateway): PaymentGatewayDraft {
  return {
    id: gateway.id,
    name: gateway.name,
    provider: gateway.provider,
    isEnabled: gateway.isEnabled,
    isTestMode: gateway.isTestMode,
    priority: String(gateway.priority),
    instructions: gateway.instructions ?? "",
    credentials: gateway.credentials.map((credential) => ({
      field: credential.field,
      label: credential.label,
      maskedValue: credential.maskedValue,
      isConfigured: credential.isConfigured,
      nextValue: "",
    })),
  };
}

function emptyFieldErrors(): FieldErrors {
  return {};
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function normalizeOptionalPhone(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function AdminSystemSettingsLanding() {
  const locale = useLocale();
  const tAdmin = useTranslations("admin");
  const tCommon = useTranslations("common");
  const sectionLabel = tAdmin("system_settings");

  const auth = useAuthSession();
  const settingsQuery = useAdminSystemSettings();
  const gatewaysQuery = useAdminSystemPaymentGateways();
  const productionStatusQuery = useAdminProductionStatus();

  const updateSettingMutation = useUpdateAdminSystemSettingMutation();
  const updateGatewayMutation = useUpdateAdminSystemPaymentGatewayMutation();
  const updateDelayOverrideMutation = useUpdateAdminProductionDelayOverrideMutation();

  const dirty = useAdminSettingsUnsavedChanges();

  const [businessDraft, setBusinessDraft] = useState<BusinessDraft>({
    websiteUrl: "",
    supportEmail: "",
    supportPhone: "",
    whatsappNumber: "",
    officeAddress: "",
    socialLinks: [],
  });
  const [quoteDraft, setQuoteDraft] = useState<QuotePricingDraft>({
    quoteCostPerPage: "0",
    quoteCoverCost: "0",
    reprintA4: "0",
    reprintA5: "0",
    reprintA6: "0",
    minimumCopies: "25",
  });
  const [notificationDraft, setNotificationDraft] = useState<NotificationDraft>({
    senderName: "",
    senderEmail: "",
    escalationRecipients: [],
    whatsappToggles: [],
  });
  const [operationalDraft, setOperationalDraft] = useState<OperationalDraft>({
    maintenanceMode: false,
    backlogThreshold: "20",
    delayOverrideState: "auto",
    delayNotes: "",
  });
  const [contentDraft, setContentDraft] = useState<ContentDraft>({
    aboutHeading: "",
    aboutSummary: "",
    aboutSections: [],
    contactHeading: "",
    contactEmail: "",
    contactPhone: "",
    contactWhatsapp: "",
    contactAddress: "",
    heroTitle: "",
    heroSubtitle: "",
    heroPrimaryCta: "",
    heroSecondaryCta: "",
    faqEntries: [],
  });
  const [seoDraft, setSeoDraft] = useState<SeoDraft>({
    canonicalBaseUrl: "",
    ogFallbackImageUrl: "",
    titleTemplate: "%s | BookPrinta",
    defaultDescription: "",
    defaultRobots: "index,follow",
  });
  const [gatewayDrafts, setGatewayDrafts] = useState<PaymentGatewayDraft[]>([]);

  const [businessErrors, setBusinessErrors] = useState<FieldErrors>(emptyFieldErrors);
  const [quoteErrors, setQuoteErrors] = useState<FieldErrors>(emptyFieldErrors);
  const [notificationErrors, setNotificationErrors] = useState<FieldErrors>(emptyFieldErrors);
  const [operationalErrors, setOperationalErrors] = useState<FieldErrors>(emptyFieldErrors);
  const [contentErrors, setContentErrors] = useState<FieldErrors>(emptyFieldErrors);
  const [seoErrors, setSeoErrors] = useState<FieldErrors>(emptyFieldErrors);
  const [gatewayErrors, setGatewayErrors] = useState<FieldErrors>(emptyFieldErrors);

  const [gatewayChangeReason, setGatewayChangeReason] = useState("");
  const [showCredentialMap, setShowCredentialMap] = useState<Record<string, boolean>>({});
  const [maintenanceConfirmOpen, setMaintenanceConfirmOpen] = useState(false);
  const [operationalChangeReason, setOperationalChangeReason] = useState("");
  const [contentSaveAction, setContentSaveAction] = useState<"all" | "contact" | "hero" | null>(
    null
  );

  const isSystemAdmin = ALLOWED_SYSTEM_ROLES.has(auth.user?.role ?? "");
  const isSuperAdmin = auth.user?.role === "SUPER_ADMIN";

  const settingsMap = useMemo(() => {
    return new Map(settingsQuery.settings.map((item) => [item.key, item]));
  }, [settingsQuery.settings]);

  const settingHasChanged = (key: AdminSystemSettingKey, nextValue: unknown): boolean => {
    const currentValue = settingsMap.get(key)?.value;
    return !valuesEqual(currentValue, nextValue);
  };

  const initializedSectionsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (settingsQuery.settings.length === 0) {
      return;
    }

    if (!initializedSectionsRef.current[SECTION_BUSINESS_PROFILE]) {
      const nextBusiness: BusinessDraft = {
        websiteUrl: toStringValue(settingsMap.get(SETTING_KEYS.business_website_url)?.value),
        supportEmail: toStringValue(settingsMap.get(SETTING_KEYS.business_support_email)?.value),
        supportPhone: toStringValue(settingsMap.get(SETTING_KEYS.business_support_phone)?.value),
        whatsappNumber: toStringValue(
          settingsMap.get(SETTING_KEYS.business_whatsapp_number)?.value
        ),
        officeAddress: toStringValue(settingsMap.get(SETTING_KEYS.business_office_address)?.value),
        socialLinks: normalizeSocialLinks(
          settingsMap.get(SETTING_KEYS.business_social_links)?.value
        ),
      };

      setBusinessDraft(nextBusiness);
      dirty.initializeSection(SECTION_BUSINESS_PROFILE, nextBusiness);
      initializedSectionsRef.current[SECTION_BUSINESS_PROFILE] = true;
    }

    if (!initializedSectionsRef.current[SECTION_QUOTE_PRICING]) {
      const nextQuote: QuotePricingDraft = {
        quoteCostPerPage: toMoney(settingsMap.get(SETTING_KEYS.quote_cost_per_page)?.value),
        quoteCoverCost: toMoney(settingsMap.get(SETTING_KEYS.quote_cover_cost)?.value),
        reprintA4: toMoney(settingsMap.get(SETTING_KEYS.reprint_cost_per_page_a4)?.value),
        reprintA5: toMoney(settingsMap.get(SETTING_KEYS.reprint_cost_per_page_a5)?.value),
        reprintA6: toMoney(settingsMap.get(SETTING_KEYS.reprint_cost_per_page_a6)?.value),
        minimumCopies: toInteger(settingsMap.get(SETTING_KEYS.reprint_minimum_copies)?.value, 25),
      };

      setQuoteDraft(nextQuote);
      dirty.initializeSection(SECTION_QUOTE_PRICING, nextQuote);
      initializedSectionsRef.current[SECTION_QUOTE_PRICING] = true;
    }

    if (!initializedSectionsRef.current[SECTION_NOTIFICATION_COMMS]) {
      const nextNotification: NotificationDraft = {
        senderName: toStringValue(settingsMap.get(SETTING_KEYS.comms_sender_name)?.value),
        senderEmail: toStringValue(settingsMap.get(SETTING_KEYS.comms_sender_email)?.value),
        escalationRecipients: toStringArray(
          settingsMap.get(SETTING_KEYS.comms_escalation_recipients)?.value
        ),
        whatsappToggles: normalizeToggles(
          settingsMap.get(SETTING_KEYS.comms_whatsapp_template_toggles)?.value
        ),
      };

      setNotificationDraft(nextNotification);
      dirty.initializeSection(SECTION_NOTIFICATION_COMMS, nextNotification);
      initializedSectionsRef.current[SECTION_NOTIFICATION_COMMS] = true;
    }

    if (!initializedSectionsRef.current[SECTION_OPERATIONAL]) {
      const nextOperational: OperationalDraft = {
        maintenanceMode: Boolean(settingsMap.get(SETTING_KEYS.maintenance_mode)?.value),
        backlogThreshold: toInteger(
          settingsMap.get(SETTING_KEYS.production_backlog_threshold)?.value,
          20
        ),
        delayOverrideState: productionStatusQuery.status?.manualOverrideState ?? "auto",
        delayNotes: "",
      };

      setOperationalDraft(nextOperational);
      dirty.initializeSection(SECTION_OPERATIONAL, nextOperational);
      initializedSectionsRef.current[SECTION_OPERATIONAL] = true;
    }

    if (!initializedSectionsRef.current[SECTION_CONTENT_CONTROLS]) {
      const about = normalizeAboutBlocks(settingsMap.get(SETTING_KEYS.content_about_blocks)?.value);
      const contact = normalizeContactBlocks(
        settingsMap.get(SETTING_KEYS.content_contact_blocks)?.value
      );
      const hero = normalizeHeroCopy(
        settingsMap.get(SETTING_KEYS.content_homepage_hero_copy)?.value
      );
      const faq = normalizeFaqEntries(settingsMap.get(SETTING_KEYS.content_faq_entries)?.value);

      const nextContent: ContentDraft = {
        aboutHeading: about.heading,
        aboutSummary: about.summary,
        aboutSections: about.sections,
        contactHeading: contact.heading,
        contactEmail: contact.supportEmail,
        contactPhone: contact.supportPhone,
        contactWhatsapp: contact.whatsappNumber,
        contactAddress: contact.officeAddress,
        heroTitle: hero.title,
        heroSubtitle: hero.subtitle,
        heroPrimaryCta: hero.primaryCtaLabel,
        heroSecondaryCta: hero.secondaryCtaLabel,
        faqEntries: faq,
      };

      setContentDraft(nextContent);
      dirty.initializeSection(SECTION_CONTENT_CONTROLS, nextContent);
      initializedSectionsRef.current[SECTION_CONTENT_CONTROLS] = true;
    }

    if (!initializedSectionsRef.current[SECTION_SEO_CONTROLS]) {
      const defaults = normalizeSeoDefaults(
        settingsMap.get(SETTING_KEYS.seo_metadata_defaults)?.value
      );
      const nextSeo: SeoDraft = {
        canonicalBaseUrl: toStringValue(
          settingsMap.get(SETTING_KEYS.seo_canonical_base_url)?.value
        ),
        ogFallbackImageUrl: toStringValue(
          settingsMap.get(SETTING_KEYS.seo_og_fallback_image_url)?.value
        ),
        titleTemplate: defaults.titleTemplate,
        defaultDescription: defaults.defaultDescription,
        defaultRobots: defaults.defaultRobots,
      };

      setSeoDraft(nextSeo);
      dirty.initializeSection(SECTION_SEO_CONTROLS, nextSeo);
      initializedSectionsRef.current[SECTION_SEO_CONTROLS] = true;
    }
  }, [
    dirty,
    productionStatusQuery.status?.manualOverrideState,
    settingsMap,
    settingsQuery.settings.length,
  ]);

  useEffect(() => {
    if (gatewaysQuery.gateways.length === 0) {
      return;
    }

    if (!initializedSectionsRef.current[SECTION_PAYMENT_GATEWAYS]) {
      const nextDrafts = gatewaysQuery.gateways.map(buildGatewayDraft);
      setGatewayDrafts(nextDrafts);
      dirty.initializeSection(SECTION_PAYMENT_GATEWAYS, nextDrafts);
      initializedSectionsRef.current[SECTION_PAYMENT_GATEWAYS] = true;
    }
  }, [dirty, gatewaysQuery.gateways]);

  useEffect(() => {
    if (!dirty.hasUnsavedChanges) {
      return;
    }

    const beforeUnloadListener = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const clickListener = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      const shouldLeave = window.confirm(tAdmin("system_settings_unsaved_guard"));
      if (!shouldLeave) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", beforeUnloadListener);
    document.addEventListener("click", clickListener, true);

    return () => {
      window.removeEventListener("beforeunload", beforeUnloadListener);
      document.removeEventListener("click", clickListener, true);
    };
  }, [dirty.hasUnsavedChanges, tAdmin]);

  function canEditKey(key: AdminSystemSettingKey): boolean {
    const definition = settingsMap.get(key);
    if (!isSystemAdmin) {
      return false;
    }

    if (definition?.requiresSuperAdmin) {
      return isSuperAdmin;
    }

    return true;
  }

  function resetBusinessSection() {
    initializedSectionsRef.current[SECTION_BUSINESS_PROFILE] = false;
    dirty.resetSection(SECTION_BUSINESS_PROFILE);
    setBusinessErrors(emptyFieldErrors());
  }

  function resetQuoteSection() {
    initializedSectionsRef.current[SECTION_QUOTE_PRICING] = false;
    dirty.resetSection(SECTION_QUOTE_PRICING);
    setQuoteErrors(emptyFieldErrors());
  }

  function resetNotificationSection() {
    initializedSectionsRef.current[SECTION_NOTIFICATION_COMMS] = false;
    dirty.resetSection(SECTION_NOTIFICATION_COMMS);
    setNotificationErrors(emptyFieldErrors());
  }

  function resetOperationalSection() {
    initializedSectionsRef.current[SECTION_OPERATIONAL] = false;
    dirty.resetSection(SECTION_OPERATIONAL);
    setOperationalErrors(emptyFieldErrors());
    setOperationalChangeReason("");
  }

  function resetContentSection() {
    initializedSectionsRef.current[SECTION_CONTENT_CONTROLS] = false;
    dirty.resetSection(SECTION_CONTENT_CONTROLS);
    setContentErrors(emptyFieldErrors());
  }

  function resetSeoSection() {
    initializedSectionsRef.current[SECTION_SEO_CONTROLS] = false;
    dirty.resetSection(SECTION_SEO_CONTROLS);
    setSeoErrors(emptyFieldErrors());
  }

  function resetGatewaySection() {
    initializedSectionsRef.current[SECTION_PAYMENT_GATEWAYS] = false;
    dirty.resetSection(SECTION_PAYMENT_GATEWAYS);
    setGatewayErrors(emptyFieldErrors());
    setGatewayChangeReason("");
  }

  async function handleSaveBusinessSection() {
    const nextErrors: FieldErrors = {};

    if (!businessDraft.websiteUrl.trim())
      nextErrors.websiteUrl = tAdmin("system_settings_validation_required");
    if (!businessDraft.supportEmail.trim())
      nextErrors.supportEmail = tAdmin("system_settings_validation_required");
    if (!businessDraft.supportPhone.trim())
      nextErrors.supportPhone = tAdmin("system_settings_validation_required");
    if (!businessDraft.officeAddress.trim())
      nextErrors.officeAddress = tAdmin("system_settings_validation_required");

    businessDraft.socialLinks.forEach((link, index) => {
      if (!link.label.trim()) {
        nextErrors[`socialLabel-${index}`] = tAdmin("system_settings_validation_required");
      }
      if (!link.url.trim()) {
        nextErrors[`socialUrl-${index}`] = tAdmin("system_settings_validation_required");
      }
    });

    setBusinessErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      const nextWebsiteUrl = businessDraft.websiteUrl.trim();
      const nextSupportEmail = businessDraft.supportEmail.trim();
      const nextSupportPhone = businessDraft.supportPhone.trim();
      const nextWhatsappNumber = businessDraft.whatsappNumber.trim();
      const nextOfficeAddress = businessDraft.officeAddress.trim();
      const nextSocialLinks = businessDraft.socialLinks
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
        .filter((link) => link.label.length > 0 && link.url.length > 0);

      if (settingHasChanged(SETTING_KEYS.business_website_url, nextWebsiteUrl)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.business_website_url,
          body: { value: nextWebsiteUrl, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.business_support_email, nextSupportEmail)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.business_support_email,
          body: { value: nextSupportEmail, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.business_support_phone, nextSupportPhone)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.business_support_phone,
          body: { value: nextSupportPhone, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.business_whatsapp_number, nextWhatsappNumber)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.business_whatsapp_number,
          body: { value: nextWhatsappNumber, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.business_office_address, nextOfficeAddress)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.business_office_address,
          body: { value: nextOfficeAddress, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.business_social_links, nextSocialLinks)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.business_social_links,
          body: {
            value: nextSocialLinks,
            changeReason: undefined,
          },
        });
      }

      dirty.markSectionSaved(SECTION_BUSINESS_PROFILE, businessDraft);
      setBusinessErrors(emptyFieldErrors());
      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminSettingsError(error);
      setBusinessErrors((previous) => ({ ...previous, ...normalized.fieldErrors }));
      toast.error(normalized.description || tAdmin("system_settings_save_failed"));
    }
  }

  async function handleSaveQuoteSection() {
    const nextErrors: FieldErrors = {};
    const numberFields: Array<[keyof QuotePricingDraft, string]> = [
      ["quoteCostPerPage", "quoteCostPerPage"],
      ["quoteCoverCost", "quoteCoverCost"],
      ["reprintA4", "reprintA4"],
      ["reprintA5", "reprintA5"],
      ["reprintA6", "reprintA6"],
      ["minimumCopies", "minimumCopies"],
    ];

    for (const [field, key] of numberFields) {
      const value = Number.parseFloat(quoteDraft[field]);
      if (!Number.isFinite(value) || value < 0) {
        nextErrors[key] = tAdmin("system_settings_validation_positive_number");
      }
    }

    setQuoteErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      const nextQuoteCostPerPage = Number.parseFloat(quoteDraft.quoteCostPerPage);
      const nextQuoteCoverCost = Number.parseFloat(quoteDraft.quoteCoverCost);
      const nextReprintA4 = Number.parseFloat(quoteDraft.reprintA4);
      const nextReprintA5 = Number.parseFloat(quoteDraft.reprintA5);
      const nextReprintA6 = Number.parseFloat(quoteDraft.reprintA6);
      const nextMinimumCopies = Number.parseInt(quoteDraft.minimumCopies, 10);

      if (settingHasChanged(SETTING_KEYS.quote_cost_per_page, nextQuoteCostPerPage)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.quote_cost_per_page,
          body: { value: nextQuoteCostPerPage, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.quote_cover_cost, nextQuoteCoverCost)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.quote_cover_cost,
          body: { value: nextQuoteCoverCost, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.reprint_cost_per_page_a4, nextReprintA4)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.reprint_cost_per_page_a4,
          body: { value: nextReprintA4, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.reprint_cost_per_page_a5, nextReprintA5)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.reprint_cost_per_page_a5,
          body: { value: nextReprintA5, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.reprint_cost_per_page_a6, nextReprintA6)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.reprint_cost_per_page_a6,
          body: { value: nextReprintA6, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.reprint_minimum_copies, nextMinimumCopies)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.reprint_minimum_copies,
          body: { value: nextMinimumCopies, changeReason: undefined },
        });
      }

      dirty.markSectionSaved(SECTION_QUOTE_PRICING, quoteDraft);
      setQuoteErrors(emptyFieldErrors());
      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminSettingsError(error);
      setQuoteErrors((previous) => ({ ...previous, ...normalized.fieldErrors }));
      toast.error(normalized.description || tAdmin("system_settings_save_failed"));
    }
  }

  async function handleSaveNotificationSection() {
    const nextErrors: FieldErrors = {};
    if (!notificationDraft.senderName.trim()) {
      nextErrors.senderName = tAdmin("system_settings_validation_required");
    }
    if (!notificationDraft.senderEmail.trim()) {
      nextErrors.senderEmail = tAdmin("system_settings_validation_required");
    }
    notificationDraft.escalationRecipients.forEach((email, index) => {
      if (!email.trim()) {
        nextErrors[`recipient-${index}`] = tAdmin("system_settings_validation_required");
      }
    });

    setNotificationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      const nextSenderName = notificationDraft.senderName.trim();
      const nextSenderEmail = notificationDraft.senderEmail.trim();
      const nextEscalationRecipients = notificationDraft.escalationRecipients
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      const nextWhatsappTemplateToggles = Object.fromEntries(
        notificationDraft.whatsappToggles
          .map((entry) => ({ key: entry.key.trim(), enabled: entry.enabled }))
          .filter((entry) => entry.key.length > 0)
          .map((entry) => [entry.key, entry.enabled])
      );

      if (settingHasChanged(SETTING_KEYS.comms_sender_name, nextSenderName)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.comms_sender_name,
          body: { value: nextSenderName, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.comms_sender_email, nextSenderEmail)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.comms_sender_email,
          body: { value: nextSenderEmail, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.comms_escalation_recipients, nextEscalationRecipients)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.comms_escalation_recipients,
          body: {
            value: nextEscalationRecipients,
            changeReason: undefined,
          },
        });
      }

      if (
        settingHasChanged(SETTING_KEYS.comms_whatsapp_template_toggles, nextWhatsappTemplateToggles)
      ) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.comms_whatsapp_template_toggles,
          body: {
            value: nextWhatsappTemplateToggles,
            changeReason: undefined,
          },
        });
      }

      dirty.markSectionSaved(SECTION_NOTIFICATION_COMMS, notificationDraft);
      setNotificationErrors(emptyFieldErrors());
      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminSettingsError(error);
      setNotificationErrors((previous) => ({ ...previous, ...normalized.fieldErrors }));
      toast.error(normalized.description || tAdmin("system_settings_save_failed"));
    }
  }

  async function persistOperationalSection(withConfirmation: boolean) {
    const nextErrors: FieldErrors = {};
    const threshold = Number.parseInt(operationalDraft.backlogThreshold, 10);

    if (!Number.isFinite(threshold) || threshold < 1) {
      nextErrors.backlogThreshold = tAdmin("system_settings_validation_positive_integer");
    }

    const baselineMaintenance = Boolean(settingsMap.get(SETTING_KEYS.maintenance_mode)?.value);
    const maintenanceChanged = baselineMaintenance !== operationalDraft.maintenanceMode;
    if (maintenanceChanged && operationalChangeReason.trim().length < 3) {
      nextErrors.changeReason = tAdmin("system_settings_validation_change_reason");
    }

    setOperationalErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      if (settingHasChanged(SETTING_KEYS.production_backlog_threshold, threshold)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.production_backlog_threshold,
          body: { value: threshold, changeReason: undefined },
        });
      }

      if (maintenanceChanged) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.maintenance_mode,
          body: {
            value: operationalDraft.maintenanceMode,
            changeReason: operationalChangeReason.trim(),
            confirmDangerousOperation: withConfirmation,
          },
        });
      }

      if (productionStatusQuery.status) {
        const currentOverride = productionStatusQuery.status.manualOverrideState;
        if (currentOverride !== operationalDraft.delayOverrideState) {
          await updateDelayOverrideMutation.mutateAsync({
            body: {
              overrideState: operationalDraft.delayOverrideState,
              notes: operationalDraft.delayNotes.trim() || undefined,
            },
          });
        }
      }

      dirty.markSectionSaved(SECTION_OPERATIONAL, operationalDraft);
      setOperationalErrors(emptyFieldErrors());
      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminSettingsError(error);
      setOperationalErrors((previous) => ({ ...previous, ...normalized.fieldErrors }));
      toast.error(normalized.description || tAdmin("system_settings_save_failed"));
    }
  }

  async function handleSaveOperationalSection() {
    const baselineMaintenance = Boolean(settingsMap.get(SETTING_KEYS.maintenance_mode)?.value);
    const maintenanceChanged = baselineMaintenance !== operationalDraft.maintenanceMode;

    if (maintenanceChanged) {
      setMaintenanceConfirmOpen(true);
      return;
    }

    await persistOperationalSection(false);
  }

  async function handleSaveContentSection() {
    const nextErrors: FieldErrors = {};
    if (!contentDraft.aboutHeading.trim()) {
      nextErrors.aboutHeading = tAdmin("system_settings_validation_required");
    }
    if (!contentDraft.contactEmail.trim()) {
      nextErrors.contactEmail = tAdmin("system_settings_validation_required");
    }

    setContentErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setContentSaveAction("all");

    try {
      const nextAboutBlocks = {
        heading: contentDraft.aboutHeading.trim(),
        summary: contentDraft.aboutSummary.trim(),
        sections: contentDraft.aboutSections
          .map((entry) => ({ title: entry.title.trim(), body: entry.body.trim() }))
          .filter((entry) => entry.title.length > 0 && entry.body.length > 0),
      };

      const nextContactBlocks = {
        heading: contentDraft.contactHeading.trim(),
        supportEmail: contentDraft.contactEmail.trim(),
        supportPhone: contentDraft.contactPhone.trim(),
        whatsappNumber: normalizeOptionalPhone(contentDraft.contactWhatsapp),
        officeAddress: contentDraft.contactAddress.trim(),
      };

      const nextHomepageHeroCopy = {
        title: contentDraft.heroTitle.trim(),
        subtitle: contentDraft.heroSubtitle.trim(),
        primaryCtaLabel: contentDraft.heroPrimaryCta.trim(),
        secondaryCtaLabel: contentDraft.heroSecondaryCta.trim(),
      };

      const nextFaqEntries = contentDraft.faqEntries
        .map((entry) => ({ question: entry.question.trim(), answer: entry.answer.trim() }))
        .filter((entry) => entry.question.length > 0 && entry.answer.length > 0);

      if (settingHasChanged(SETTING_KEYS.content_about_blocks, nextAboutBlocks)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.content_about_blocks,
          body: {
            value: nextAboutBlocks,
            changeReason: undefined,
          },
        });
      }

      if (settingHasChanged(SETTING_KEYS.content_contact_blocks, nextContactBlocks)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.content_contact_blocks,
          body: {
            value: nextContactBlocks,
            changeReason: undefined,
          },
        });
      }

      if (settingHasChanged(SETTING_KEYS.content_homepage_hero_copy, nextHomepageHeroCopy)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.content_homepage_hero_copy,
          body: {
            value: nextHomepageHeroCopy,
            changeReason: undefined,
          },
        });
      }

      if (settingHasChanged(SETTING_KEYS.content_faq_entries, nextFaqEntries)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.content_faq_entries,
          body: {
            value: nextFaqEntries,
            changeReason: undefined,
          },
        });
      }

      dirty.markSectionSaved(SECTION_CONTENT_CONTROLS, contentDraft);
      setContentErrors(emptyFieldErrors());
      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminSettingsError(error);
      setContentErrors((previous) => ({ ...previous, ...normalized.fieldErrors }));
      toast.error(normalized.description || tAdmin("system_settings_save_failed"));
    } finally {
      setContentSaveAction(null);
    }
  }

  async function handleSaveContentContactBlock() {
    const nextErrors: FieldErrors = {};

    if (!contentDraft.contactHeading.trim()) {
      nextErrors.contactHeading = tAdmin("system_settings_validation_required");
    }
    if (!contentDraft.contactEmail.trim()) {
      nextErrors.contactEmail = tAdmin("system_settings_validation_required");
    }
    if (!contentDraft.contactPhone.trim()) {
      nextErrors.contactPhone = tAdmin("system_settings_validation_required");
    }
    if (!contentDraft.contactAddress.trim()) {
      nextErrors.contactAddress = tAdmin("system_settings_validation_required");
    }

    setContentErrors((previous) => ({ ...previous, ...nextErrors }));
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setContentSaveAction("contact");

    try {
      const nextContactBlocks = {
        heading: contentDraft.contactHeading.trim(),
        supportEmail: contentDraft.contactEmail.trim(),
        supportPhone: contentDraft.contactPhone.trim(),
        whatsappNumber: normalizeOptionalPhone(contentDraft.contactWhatsapp),
        officeAddress: contentDraft.contactAddress.trim(),
      };

      if (settingHasChanged(SETTING_KEYS.content_contact_blocks, nextContactBlocks)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.content_contact_blocks,
          body: {
            value: nextContactBlocks,
            changeReason: undefined,
          },
        });
      }

      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminSettingsError(error);
      setContentErrors((previous) => ({ ...previous, ...normalized.fieldErrors }));
      toast.error(normalized.description || tAdmin("system_settings_save_failed"));
    } finally {
      setContentSaveAction(null);
    }
  }

  async function handleSaveContentHeroBlock() {
    const nextErrors: FieldErrors = {};

    if (!contentDraft.heroTitle.trim()) {
      nextErrors.heroTitle = tAdmin("system_settings_validation_required");
    }
    if (!contentDraft.heroSubtitle.trim()) {
      nextErrors.heroSubtitle = tAdmin("system_settings_validation_required");
    }
    if (!contentDraft.heroPrimaryCta.trim()) {
      nextErrors.heroPrimaryCta = tAdmin("system_settings_validation_required");
    }
    if (!contentDraft.heroSecondaryCta.trim()) {
      nextErrors.heroSecondaryCta = tAdmin("system_settings_validation_required");
    }

    setContentErrors((previous) => ({ ...previous, ...nextErrors }));
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setContentSaveAction("hero");

    try {
      const nextHomepageHeroCopy = {
        title: contentDraft.heroTitle.trim(),
        subtitle: contentDraft.heroSubtitle.trim(),
        primaryCtaLabel: contentDraft.heroPrimaryCta.trim(),
        secondaryCtaLabel: contentDraft.heroSecondaryCta.trim(),
      };

      if (settingHasChanged(SETTING_KEYS.content_homepage_hero_copy, nextHomepageHeroCopy)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.content_homepage_hero_copy,
          body: {
            value: nextHomepageHeroCopy,
            changeReason: undefined,
          },
        });
      }

      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminSettingsError(error);
      setContentErrors((previous) => ({ ...previous, ...normalized.fieldErrors }));
      toast.error(normalized.description || tAdmin("system_settings_save_failed"));
    } finally {
      setContentSaveAction(null);
    }
  }

  async function handleSaveSeoSection() {
    const nextErrors: FieldErrors = {};
    if (!seoDraft.canonicalBaseUrl.trim()) {
      nextErrors.canonicalBaseUrl = tAdmin("system_settings_validation_required");
    }
    if (!seoDraft.ogFallbackImageUrl.trim()) {
      nextErrors.ogFallbackImageUrl = tAdmin("system_settings_validation_required");
    }
    if (!seoDraft.titleTemplate.trim()) {
      nextErrors.titleTemplate = tAdmin("system_settings_validation_required");
    }

    setSeoErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      const nextCanonicalBaseUrl = seoDraft.canonicalBaseUrl.trim();
      const nextOgFallbackImageUrl = seoDraft.ogFallbackImageUrl.trim();
      const nextSeoMetadataDefaults = {
        titleTemplate: seoDraft.titleTemplate.trim(),
        defaultDescription: seoDraft.defaultDescription.trim(),
        defaultRobots: seoDraft.defaultRobots,
      };

      if (settingHasChanged(SETTING_KEYS.seo_canonical_base_url, nextCanonicalBaseUrl)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.seo_canonical_base_url,
          body: { value: nextCanonicalBaseUrl, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.seo_og_fallback_image_url, nextOgFallbackImageUrl)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.seo_og_fallback_image_url,
          body: { value: nextOgFallbackImageUrl, changeReason: undefined },
        });
      }

      if (settingHasChanged(SETTING_KEYS.seo_metadata_defaults, nextSeoMetadataDefaults)) {
        await updateSettingMutation.mutateAsync({
          key: SETTING_KEYS.seo_metadata_defaults,
          body: {
            value: nextSeoMetadataDefaults,
            changeReason: undefined,
          },
        });
      }

      dirty.markSectionSaved(SECTION_SEO_CONTROLS, seoDraft);
      setSeoErrors(emptyFieldErrors());
      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminSettingsError(error);
      setSeoErrors((previous) => ({ ...previous, ...normalized.fieldErrors }));
      toast.error(normalized.description || tAdmin("system_settings_save_failed"));
    }
  }

  async function handleSavePaymentGatewaysSection() {
    const nextErrors: FieldErrors = {};

    for (const gateway of gatewayDrafts) {
      const priority = Number.parseInt(gateway.priority, 10);
      if (!Number.isFinite(priority) || priority < 0) {
        nextErrors[`priority-${gateway.id}`] = tAdmin(
          "system_settings_validation_positive_integer"
        );
      }
    }

    const disablingGateway = gatewayDrafts.find((draft) => {
      const original = gatewaysQuery.gateways.find((gateway) => gateway.id === draft.id);
      return Boolean(original?.isEnabled && !draft.isEnabled);
    });

    if (disablingGateway && gatewayChangeReason.trim().length < 3) {
      nextErrors.gatewayChangeReason = tAdmin("system_settings_validation_change_reason");
    }

    setGatewayErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      for (const draft of gatewayDrafts) {
        const original = gatewaysQuery.gateways.find((gateway) => gateway.id === draft.id);
        if (!original) {
          continue;
        }

        const priority = Number.parseInt(draft.priority, 10);

        const credentials = draft.credentials
          .map((credential) => ({
            field: credential.field,
            value: credential.nextValue.trim(),
          }))
          .filter((credential) => credential.value.length > 0);

        const changed =
          original.isEnabled !== draft.isEnabled ||
          original.isTestMode !== draft.isTestMode ||
          original.priority !== priority ||
          (original.instructions ?? "") !== draft.instructions ||
          credentials.length > 0;

        if (!changed) {
          continue;
        }

        await updateGatewayMutation.mutateAsync({
          gatewayId: draft.id,
          body: {
            isEnabled: draft.isEnabled,
            isTestMode: draft.isTestMode,
            priority,
            instructions: draft.instructions.trim() || null,
            credentials,
            confirmDangerousOperation: original.isEnabled && !draft.isEnabled ? true : undefined,
            changeReason:
              original.isEnabled && !draft.isEnabled ? gatewayChangeReason.trim() : undefined,
          },
        });
      }

      dirty.markSectionSaved(SECTION_PAYMENT_GATEWAYS, gatewayDrafts);
      setGatewayErrors(emptyFieldErrors());
      setGatewayChangeReason("");
      toast.success(tAdmin("system_settings_saved"));
    } catch (error) {
      const normalized = normalizeAdminSettingsError(error);
      setGatewayErrors((previous) => ({ ...previous, ...normalized.fieldErrors }));
      toast.error(normalized.description || tAdmin("system_settings_save_failed"));
    }
  }

  const savingAnySection =
    updateSettingMutation.isPending ||
    updateGatewayMutation.isPending ||
    updateDelayOverrideMutation.isPending;

  const readOnlyBanner = !isSystemAdmin
    ? tAdmin("system_settings_read_only")
    : !isSuperAdmin
      ? tAdmin("system_settings_partial_access")
      : null;

  return (
    <section className="grid min-w-0 gap-4 [&_[data-slot=button][data-variant=outline]]:border-[#2A2A2A] [&_[data-slot=button][data-variant=outline]]:bg-[#0D0D0D] [&_[data-slot=button][data-variant=outline]]:text-[#E8E8E8] [&_[data-slot=button][data-variant=outline]]:hover:bg-[#171717] [&_[data-slot=button][data-variant=outline]]:hover:text-white">
      <div className="rounded-[1.75rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#050505_0%,#0B0B0B_100%)] p-6 md:p-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.32em] text-[#7D7D7D]">
          {tAdmin("panel_label")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {sectionLabel}
        </h1>
        <p className="font-sans mt-3 max-w-2xl text-sm leading-6 text-[#B4B4B4] md:text-base">
          {tAdmin("system_settings_scope_description")}
        </p>

        {readOnlyBanner ? (
          <div className="mt-4 rounded-2xl border border-[#4B3A13] bg-[#1A1508] px-4 py-3">
            <p className="font-sans text-sm text-[#F6D58F]">{readOnlyBanner}</p>
          </div>
        ) : null}

        {dirty.hasUnsavedChanges ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#4B3714] bg-[#1A1508] px-3 py-1.5">
            <AlertCircle className="size-4 text-[#FFCF7A]" aria-hidden="true" />
            <span className="font-sans text-xs text-[#F6D58F]">
              {tAdmin("system_settings_unsaved_status")}
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:gap-5">
        <article className="rounded-[1.4rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#0A0A0A_0%,#060606_100%)] p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-white">
              {tAdmin("system_settings_section_payment_gateways")}
            </h2>
            {dirty.isSectionDirty(SECTION_PAYMENT_GATEWAYS) ? (
              <Badge className="border-[#204B2A] bg-[#102015] text-[#99E4AB]">
                {tAdmin("system_settings_dirty_badge")}
              </Badge>
            ) : null}
          </div>
          <p className="font-sans mt-2 text-sm text-[#AFAFAF]">
            {tAdmin("system_settings_payment_gateways_help")}
          </p>

          <div className="mt-4 grid gap-3">
            {gatewaysQuery.isInitialLoading ? (
              <div className="rounded-xl border border-[#232323] bg-[#0F0F0F] px-4 py-8 text-center font-sans text-sm text-[#9D9D9D]">
                {tAdmin("system_settings_loading")}
              </div>
            ) : null}

            {gatewayDrafts.map((gateway) => {
              const isEditable = isSystemAdmin;
              return (
                <div
                  key={gateway.id}
                  className="rounded-xl border border-[#1F1F1F] bg-[#0C0C0C] p-4 md:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-sans text-base font-semibold text-white">{gateway.name}</p>
                      <p className="font-sans mt-1 text-xs uppercase tracking-[0.08em] text-[#8D8D8D]">
                        {gateway.provider}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          gateway.isEnabled
                            ? "border-[#1C5D2F] bg-[#0C1D12] text-[#8DE4A7]"
                            : "border-[#525252] bg-[#1A1A1A] text-[#D2D2D2]"
                        }
                      >
                        {gateway.isEnabled
                          ? tAdmin("system_settings_enabled")
                          : tAdmin("system_settings_disabled")}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <span className="font-sans text-xs text-[#9F9F9F]">
                        {tAdmin("system_settings_enabled")}
                      </span>
                      <Switch
                        checked={gateway.isEnabled}
                        disabled={!isEditable || savingAnySection}
                        onCheckedChange={(checked) => {
                          setGatewayDrafts((previous) =>
                            previous.map((item) =>
                              item.id === gateway.id ? { ...item, isEnabled: checked } : item
                            )
                          );
                          dirty.updateSectionDraft(
                            SECTION_PAYMENT_GATEWAYS,
                            gatewayDrafts.map((item) =>
                              item.id === gateway.id ? { ...item, isEnabled: checked } : item
                            )
                          );
                        }}
                      />
                    </div>

                    <div className="grid gap-2">
                      <span className="font-sans text-xs text-[#9F9F9F]">
                        {tAdmin("system_settings_mode")}
                      </span>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={gateway.isTestMode}
                          disabled={!isEditable || savingAnySection}
                          onCheckedChange={(checked) => {
                            setGatewayDrafts((previous) =>
                              previous.map((item) =>
                                item.id === gateway.id ? { ...item, isTestMode: checked } : item
                              )
                            );
                            dirty.updateSectionDraft(
                              SECTION_PAYMENT_GATEWAYS,
                              gatewayDrafts.map((item) =>
                                item.id === gateway.id ? { ...item, isTestMode: checked } : item
                              )
                            );
                          }}
                        />
                        <span className="font-sans text-sm text-[#D0D0D0]">
                          {gateway.isTestMode
                            ? tAdmin("system_settings_test_mode")
                            : tAdmin("system_settings_live_mode")}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <span className="font-sans text-xs text-[#9F9F9F]">
                        {tAdmin("system_settings_gateway_priority")}
                      </span>
                      <Input
                        inputMode="numeric"
                        value={gateway.priority}
                        disabled={!isEditable || savingAnySection}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setGatewayDrafts((previous) =>
                            previous.map((item) =>
                              item.id === gateway.id ? { ...item, priority: nextValue } : item
                            )
                          );
                          dirty.updateSectionDraft(
                            SECTION_PAYMENT_GATEWAYS,
                            gatewayDrafts.map((item) =>
                              item.id === gateway.id ? { ...item, priority: nextValue } : item
                            )
                          );
                        }}
                      />
                      {gatewayErrors[`priority-${gateway.id}`] ? (
                        <p className="font-sans text-xs text-[#F39A9A]">
                          {gatewayErrors[`priority-${gateway.id}`]}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    <span className="font-sans text-xs text-[#9F9F9F]">
                      {tAdmin("system_settings_gateway_instructions")}
                    </span>
                    <Textarea
                      rows={3}
                      value={gateway.instructions}
                      disabled={!isEditable || savingAnySection}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setGatewayDrafts((previous) =>
                          previous.map((item) =>
                            item.id === gateway.id ? { ...item, instructions: nextValue } : item
                          )
                        );
                        dirty.updateSectionDraft(
                          SECTION_PAYMENT_GATEWAYS,
                          gatewayDrafts.map((item) =>
                            item.id === gateway.id ? { ...item, instructions: nextValue } : item
                          )
                        );
                      }}
                    />
                  </div>

                  <div className="mt-4 grid gap-3">
                    {gateway.credentials.map((credential) => {
                      const toggleId = `${gateway.id}:${credential.field}`;
                      const showValue = Boolean(showCredentialMap[toggleId]);
                      return (
                        <div
                          key={toggleId}
                          className="rounded-lg border border-[#232323] bg-[#111111] p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-sans text-sm font-medium text-[#E8E8E8]">
                              {credential.label}
                            </p>
                            <button
                              type="button"
                              className="font-sans inline-flex items-center gap-1 text-xs text-[#C7C7C7] hover:text-white"
                              onClick={() => {
                                setShowCredentialMap((previous) => ({
                                  ...previous,
                                  [toggleId]: !showValue,
                                }));
                              }}
                            >
                              {showValue ? (
                                <EyeOff className="size-3" />
                              ) : (
                                <Eye className="size-3" />
                              )}
                              {showValue
                                ? tAdmin("system_settings_hide_secret")
                                : tAdmin("system_settings_show_secret")}
                            </button>
                          </div>

                          <p className="font-sans mt-1 text-xs text-[#8E8E8E]">
                            {credential.maskedValue ??
                              tAdmin("system_settings_secret_not_configured")}
                          </p>

                          <Input
                            className="mt-2"
                            type={showValue ? "text" : "password"}
                            autoComplete="off"
                            value={credential.nextValue}
                            disabled={!isEditable || savingAnySection}
                            placeholder={tAdmin("system_settings_secret_replace_placeholder")}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setGatewayDrafts((previous) =>
                                previous.map((item) => {
                                  if (item.id !== gateway.id) {
                                    return item;
                                  }

                                  return {
                                    ...item,
                                    credentials: item.credentials.map((entry) =>
                                      entry.field === credential.field
                                        ? { ...entry, nextValue }
                                        : entry
                                    ),
                                  };
                                })
                              );
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="grid gap-2 rounded-xl border border-[#232323] bg-[#0F0F0F] p-3">
              <span className="font-sans text-xs text-[#9F9F9F]">
                {tAdmin("system_settings_field_change_reason")}
              </span>
              <Textarea
                rows={2}
                value={gatewayChangeReason}
                disabled={!isSystemAdmin || savingAnySection}
                onChange={(event) => setGatewayChangeReason(event.target.value)}
                placeholder={tAdmin("system_settings_change_reason_hint")}
              />
              {gatewayErrors.gatewayChangeReason ? (
                <p className="font-sans text-xs text-[#F39A9A]">
                  {gatewayErrors.gatewayChangeReason}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={
                  !isSystemAdmin ||
                  savingAnySection ||
                  !dirty.isSectionDirty(SECTION_PAYMENT_GATEWAYS)
                }
                onClick={() => void handleSavePaymentGatewaysSection()}
                className="min-h-11 rounded-full"
              >
                {savingAnySection ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {tAdmin("system_settings_save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={savingAnySection || !dirty.isSectionDirty(SECTION_PAYMENT_GATEWAYS)}
                onClick={resetGatewaySection}
                className="min-h-11 rounded-full"
              >
                {tCommon("cancel")}
              </Button>
            </div>
          </div>
        </article>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
          <article className="rounded-[1.4rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#0A0A0A_0%,#060606_100%)] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-white">
                {tAdmin("system_settings_section_business_profile")}
              </h2>
              {dirty.isSectionDirty(SECTION_BUSINESS_PROFILE) ? (
                <Badge className="border-[#204B2A] bg-[#102015] text-[#99E4AB]">
                  {tAdmin("system_settings_dirty_badge")}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_business_website")}
                </span>
                <Input
                  type="url"
                  value={businessDraft.websiteUrl}
                  disabled={!canEditKey(SETTING_KEYS.business_website_url) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...businessDraft, websiteUrl: event.target.value };
                    setBusinessDraft(next);
                    dirty.updateSectionDraft(SECTION_BUSINESS_PROFILE, next);
                  }}
                />
                {businessErrors.websiteUrl ? (
                  <p className="font-sans text-xs text-[#F39A9A]">{businessErrors.websiteUrl}</p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_business_email")}
                </span>
                <Input
                  type="email"
                  value={businessDraft.supportEmail}
                  disabled={!canEditKey(SETTING_KEYS.business_support_email) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...businessDraft, supportEmail: event.target.value };
                    setBusinessDraft(next);
                    dirty.updateSectionDraft(SECTION_BUSINESS_PROFILE, next);
                  }}
                />
                {businessErrors.supportEmail ? (
                  <p className="font-sans text-xs text-[#F39A9A]">{businessErrors.supportEmail}</p>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <span className="font-sans text-xs text-[#9F9F9F]">
                    {tAdmin("system_settings_business_phone")}
                  </span>
                  <Input
                    value={businessDraft.supportPhone}
                    disabled={!canEditKey(SETTING_KEYS.business_support_phone) || savingAnySection}
                    onChange={(event) => {
                      const next = { ...businessDraft, supportPhone: event.target.value };
                      setBusinessDraft(next);
                      dirty.updateSectionDraft(SECTION_BUSINESS_PROFILE, next);
                    }}
                  />
                </div>

                <div className="grid gap-1.5">
                  <span className="font-sans text-xs text-[#9F9F9F]">
                    {tAdmin("system_settings_business_whatsapp")}
                  </span>
                  <Input
                    value={businessDraft.whatsappNumber}
                    disabled={
                      !canEditKey(SETTING_KEYS.business_whatsapp_number) || savingAnySection
                    }
                    onChange={(event) => {
                      const next = { ...businessDraft, whatsappNumber: event.target.value };
                      setBusinessDraft(next);
                      dirty.updateSectionDraft(SECTION_BUSINESS_PROFILE, next);
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_business_address")}
                </span>
                <Textarea
                  rows={2}
                  value={businessDraft.officeAddress}
                  disabled={!canEditKey(SETTING_KEYS.business_office_address) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...businessDraft, officeAddress: event.target.value };
                    setBusinessDraft(next);
                    dirty.updateSectionDraft(SECTION_BUSINESS_PROFILE, next);
                  }}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs text-[#9F9F9F]">
                    {tAdmin("system_settings_business_social_links")}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canEditKey(SETTING_KEYS.business_social_links) || savingAnySection}
                    onClick={() => {
                      const next = {
                        ...businessDraft,
                        socialLinks: [...businessDraft.socialLinks, { label: "", url: "" }],
                      };
                      setBusinessDraft(next);
                      dirty.updateSectionDraft(SECTION_BUSINESS_PROFILE, next);
                    }}
                  >
                    <Plus className="size-3" />
                    {tAdmin("system_settings_add")}
                  </Button>
                </div>

                {businessDraft.socialLinks.map((link, index) => (
                  <div
                    key={`${link.label.trim()}-${link.url.trim()}`}
                    className="grid gap-2 rounded-lg border border-[#232323] bg-[#111111] p-3"
                  >
                    <Input
                      placeholder={tAdmin("system_settings_social_label_placeholder")}
                      value={link.label}
                      disabled={!canEditKey(SETTING_KEYS.business_social_links) || savingAnySection}
                      onChange={(event) => {
                        const nextLinks = businessDraft.socialLinks.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, label: event.target.value } : entry
                        );
                        const next = { ...businessDraft, socialLinks: nextLinks };
                        setBusinessDraft(next);
                        dirty.updateSectionDraft(SECTION_BUSINESS_PROFILE, next);
                      }}
                    />
                    <Input
                      placeholder={tAdmin("system_settings_social_url_placeholder")}
                      value={link.url}
                      disabled={!canEditKey(SETTING_KEYS.business_social_links) || savingAnySection}
                      onChange={(event) => {
                        const nextLinks = businessDraft.socialLinks.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, url: event.target.value } : entry
                        );
                        const next = { ...businessDraft, socialLinks: nextLinks };
                        setBusinessDraft(next);
                        dirty.updateSectionDraft(SECTION_BUSINESS_PROFILE, next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!canEditKey(SETTING_KEYS.business_social_links) || savingAnySection}
                      className="justify-start text-[#F2B3B3] hover:text-[#FFD7D7]"
                      onClick={() => {
                        const nextLinks = businessDraft.socialLinks.filter(
                          (_, entryIndex) => entryIndex !== index
                        );
                        const next = { ...businessDraft, socialLinks: nextLinks };
                        setBusinessDraft(next);
                        dirty.updateSectionDraft(SECTION_BUSINESS_PROFILE, next);
                      }}
                    >
                      <Trash2 className="size-3" />
                      {tAdmin("system_settings_remove")}
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={
                    !isSystemAdmin ||
                    savingAnySection ||
                    !dirty.isSectionDirty(SECTION_BUSINESS_PROFILE)
                  }
                  onClick={() => void handleSaveBusinessSection()}
                  className="min-h-11 rounded-full"
                >
                  {savingAnySection ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {tAdmin("system_settings_save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingAnySection || !dirty.isSectionDirty(SECTION_BUSINESS_PROFILE)}
                  onClick={resetBusinessSection}
                  className="min-h-11 rounded-full"
                >
                  {tCommon("cancel")}
                </Button>
              </div>

              {Object.keys(businessErrors).length > 0 ? (
                <p className="font-sans text-xs text-[#F39A9A]">
                  {tAdmin("system_settings_fix_errors_before_save")}
                </p>
              ) : null}
            </div>
          </article>

          <article className="rounded-[1.4rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#0A0A0A_0%,#060606_100%)] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-white">
                {tAdmin("system_settings_section_quote_pricing")}
              </h2>
              {dirty.isSectionDirty(SECTION_QUOTE_PRICING) ? (
                <Badge className="border-[#204B2A] bg-[#102015] text-[#99E4AB]">
                  {tAdmin("system_settings_dirty_badge")}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              {[
                {
                  key: "quoteCostPerPage" as const,
                  label: tAdmin("system_settings_quote_cost_per_page"),
                  settingKey: SETTING_KEYS.quote_cost_per_page,
                },
                {
                  key: "quoteCoverCost" as const,
                  label: tAdmin("system_settings_quote_cover_cost"),
                  settingKey: SETTING_KEYS.quote_cover_cost,
                },
                {
                  key: "reprintA4" as const,
                  label: tAdmin("system_settings_reprint_a4"),
                  settingKey: SETTING_KEYS.reprint_cost_per_page_a4,
                },
                {
                  key: "reprintA5" as const,
                  label: tAdmin("system_settings_reprint_a5"),
                  settingKey: SETTING_KEYS.reprint_cost_per_page_a5,
                },
                {
                  key: "reprintA6" as const,
                  label: tAdmin("system_settings_reprint_a6"),
                  settingKey: SETTING_KEYS.reprint_cost_per_page_a6,
                },
              ].map((field) => (
                <div key={field.key} className="grid gap-1.5">
                  <span className="font-sans text-xs text-[#9F9F9F]">{field.label}</span>
                  <Input
                    inputMode="decimal"
                    value={quoteDraft[field.key]}
                    disabled={!canEditKey(field.settingKey) || savingAnySection}
                    onChange={(event) => {
                      const next = { ...quoteDraft, [field.key]: event.target.value };
                      setQuoteDraft(next);
                      dirty.updateSectionDraft(SECTION_QUOTE_PRICING, next);
                    }}
                  />
                  <p className="font-sans text-xs text-[#8F8F8F]">
                    {formatNgn(locale, quoteDraft[field.key])}
                  </p>
                  {quoteErrors[field.key] ? (
                    <p className="font-sans text-xs text-[#F39A9A]">{quoteErrors[field.key]}</p>
                  ) : null}
                </div>
              ))}

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_reprint_minimum_copies")}
                </span>
                <Input
                  inputMode="numeric"
                  value={quoteDraft.minimumCopies}
                  disabled={!canEditKey(SETTING_KEYS.reprint_minimum_copies) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...quoteDraft, minimumCopies: event.target.value };
                    setQuoteDraft(next);
                    dirty.updateSectionDraft(SECTION_QUOTE_PRICING, next);
                  }}
                />
                {quoteErrors.minimumCopies ? (
                  <p className="font-sans text-xs text-[#F39A9A]">{quoteErrors.minimumCopies}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={
                    !isSystemAdmin ||
                    savingAnySection ||
                    !dirty.isSectionDirty(SECTION_QUOTE_PRICING)
                  }
                  onClick={() => void handleSaveQuoteSection()}
                  className="min-h-11 rounded-full"
                >
                  {savingAnySection ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {tAdmin("system_settings_save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingAnySection || !dirty.isSectionDirty(SECTION_QUOTE_PRICING)}
                  onClick={resetQuoteSection}
                  className="min-h-11 rounded-full"
                >
                  {tCommon("cancel")}
                </Button>
              </div>
            </div>
          </article>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
          <article className="rounded-[1.4rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#0A0A0A_0%,#060606_100%)] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-white">
                {tAdmin("system_settings_section_notification_comms")}
              </h2>
              {dirty.isSectionDirty(SECTION_NOTIFICATION_COMMS) ? (
                <Badge className="border-[#204B2A] bg-[#102015] text-[#99E4AB]">
                  {tAdmin("system_settings_dirty_badge")}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_sender_name")}
                </span>
                <Input
                  value={notificationDraft.senderName}
                  disabled={!canEditKey(SETTING_KEYS.comms_sender_name) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...notificationDraft, senderName: event.target.value };
                    setNotificationDraft(next);
                    dirty.updateSectionDraft(SECTION_NOTIFICATION_COMMS, next);
                  }}
                />
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_sender_email")}
                </span>
                <Input
                  type="email"
                  value={notificationDraft.senderEmail}
                  disabled={!canEditKey(SETTING_KEYS.comms_sender_email) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...notificationDraft, senderEmail: event.target.value };
                    setNotificationDraft(next);
                    dirty.updateSectionDraft(SECTION_NOTIFICATION_COMMS, next);
                  }}
                />
              </div>

              <div className="grid gap-2 rounded-lg border border-[#232323] bg-[#101010] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs text-[#9F9F9F]">
                    {tAdmin("system_settings_whatsapp_templates")}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !canEditKey(SETTING_KEYS.comms_whatsapp_template_toggles) || savingAnySection
                    }
                    onClick={() => {
                      const next = {
                        ...notificationDraft,
                        whatsappToggles: [
                          ...notificationDraft.whatsappToggles,
                          { key: "", enabled: true },
                        ],
                      };
                      setNotificationDraft(next);
                      dirty.updateSectionDraft(SECTION_NOTIFICATION_COMMS, next);
                    }}
                  >
                    <Plus className="size-3" />
                    {tAdmin("system_settings_add")}
                  </Button>
                </div>

                {notificationDraft.whatsappToggles.map((toggle, index) => (
                  <div
                    key={`${toggle.key.trim()}-${toggle.enabled ? "1" : "0"}`}
                    className="grid gap-2 rounded-md border border-[#2A2A2A] p-2 md:grid-cols-[1fr_auto_auto] md:items-center"
                  >
                    <Input
                      value={toggle.key}
                      placeholder={tAdmin("system_settings_template_key_placeholder")}
                      disabled={
                        !canEditKey(SETTING_KEYS.comms_whatsapp_template_toggles) ||
                        savingAnySection
                      }
                      onChange={(event) => {
                        const nextToggles = notificationDraft.whatsappToggles.map(
                          (entry, entryIndex) =>
                            entryIndex === index ? { ...entry, key: event.target.value } : entry
                        );
                        const next = { ...notificationDraft, whatsappToggles: nextToggles };
                        setNotificationDraft(next);
                        dirty.updateSectionDraft(SECTION_NOTIFICATION_COMMS, next);
                      }}
                    />

                    <Switch
                      checked={toggle.enabled}
                      disabled={
                        !canEditKey(SETTING_KEYS.comms_whatsapp_template_toggles) ||
                        savingAnySection
                      }
                      onCheckedChange={(checked) => {
                        const nextToggles = notificationDraft.whatsappToggles.map(
                          (entry, entryIndex) =>
                            entryIndex === index ? { ...entry, enabled: checked } : entry
                        );
                        const next = { ...notificationDraft, whatsappToggles: nextToggles };
                        setNotificationDraft(next);
                        dirty.updateSectionDraft(SECTION_NOTIFICATION_COMMS, next);
                      }}
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={
                        !canEditKey(SETTING_KEYS.comms_whatsapp_template_toggles) ||
                        savingAnySection
                      }
                      onClick={() => {
                        const nextToggles = notificationDraft.whatsappToggles.filter(
                          (_, entryIndex) => entryIndex !== index
                        );
                        const next = { ...notificationDraft, whatsappToggles: nextToggles };
                        setNotificationDraft(next);
                        dirty.updateSectionDraft(SECTION_NOTIFICATION_COMMS, next);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 rounded-lg border border-[#232323] bg-[#101010] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs text-[#9F9F9F]">
                    {tAdmin("system_settings_escalation_recipients")}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !canEditKey(SETTING_KEYS.comms_escalation_recipients) || savingAnySection
                    }
                    onClick={() => {
                      const next = {
                        ...notificationDraft,
                        escalationRecipients: [...notificationDraft.escalationRecipients, ""],
                      };
                      setNotificationDraft(next);
                      dirty.updateSectionDraft(SECTION_NOTIFICATION_COMMS, next);
                    }}
                  >
                    <Plus className="size-3" />
                    {tAdmin("system_settings_add")}
                  </Button>
                </div>

                <ScrollArea className="max-h-40">
                  <div className="grid gap-2 pr-2">
                    {notificationDraft.escalationRecipients.map((recipient, index) => (
                      <div
                        key={recipient.trim() || "recipient-empty"}
                        className="flex items-center gap-2"
                      >
                        <Input
                          value={recipient}
                          placeholder={tAdmin("system_settings_recipient_placeholder")}
                          disabled={
                            !canEditKey(SETTING_KEYS.comms_escalation_recipients) ||
                            savingAnySection
                          }
                          onChange={(event) => {
                            const nextRecipients = notificationDraft.escalationRecipients.map(
                              (entry, entryIndex) =>
                                entryIndex === index ? event.target.value : entry
                            );
                            const next = {
                              ...notificationDraft,
                              escalationRecipients: nextRecipients,
                            };
                            setNotificationDraft(next);
                            dirty.updateSectionDraft(SECTION_NOTIFICATION_COMMS, next);
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={
                            !canEditKey(SETTING_KEYS.comms_escalation_recipients) ||
                            savingAnySection
                          }
                          onClick={() => {
                            const nextRecipients = notificationDraft.escalationRecipients.filter(
                              (_, entryIndex) => entryIndex !== index
                            );
                            const next = {
                              ...notificationDraft,
                              escalationRecipients: nextRecipients,
                            };
                            setNotificationDraft(next);
                            dirty.updateSectionDraft(SECTION_NOTIFICATION_COMMS, next);
                          }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={
                    !isSystemAdmin ||
                    savingAnySection ||
                    !dirty.isSectionDirty(SECTION_NOTIFICATION_COMMS)
                  }
                  onClick={() => void handleSaveNotificationSection()}
                  className="min-h-11 rounded-full"
                >
                  {savingAnySection ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {tAdmin("system_settings_save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingAnySection || !dirty.isSectionDirty(SECTION_NOTIFICATION_COMMS)}
                  onClick={resetNotificationSection}
                  className="min-h-11 rounded-full"
                >
                  {tCommon("cancel")}
                </Button>
              </div>

              {Object.keys(notificationErrors).length > 0 ? (
                <p className="font-sans text-xs text-[#F39A9A]">
                  {tAdmin("system_settings_fix_errors_before_save")}
                </p>
              ) : null}
            </div>
          </article>

          <article className="rounded-[1.4rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#0A0A0A_0%,#060606_100%)] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-white">
                {tAdmin("system_settings_section_operational")}
              </h2>
              {dirty.isSectionDirty(SECTION_OPERATIONAL) ? (
                <Badge className="border-[#204B2A] bg-[#102015] text-[#99E4AB]">
                  {tAdmin("system_settings_dirty_badge")}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-[#2D2315] bg-[#171108] p-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 size-4 text-[#F9CA78]" />
                  <p className="font-sans text-sm text-[#F4D8A0]">
                    {tAdmin("system_settings_operational_warning")}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border border-[#232323] bg-[#111111] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-sans text-sm text-white">
                      {tAdmin("system_settings_maintenance_mode")}
                    </p>
                    <p className="font-sans text-xs text-[#9A9A9A]">
                      {tAdmin("system_settings_maintenance_mode_hint")}
                    </p>
                  </div>
                  <Switch
                    checked={operationalDraft.maintenanceMode}
                    disabled={!canEditKey(SETTING_KEYS.maintenance_mode) || savingAnySection}
                    onCheckedChange={(checked) => {
                      const next = { ...operationalDraft, maintenanceMode: checked };
                      setOperationalDraft(next);
                      dirty.updateSectionDraft(SECTION_OPERATIONAL, next);
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_backlog_threshold")}
                </span>
                <Input
                  inputMode="numeric"
                  value={operationalDraft.backlogThreshold}
                  disabled={
                    !canEditKey(SETTING_KEYS.production_backlog_threshold) || savingAnySection
                  }
                  onChange={(event) => {
                    const next = { ...operationalDraft, backlogThreshold: event.target.value };
                    setOperationalDraft(next);
                    dirty.updateSectionDraft(SECTION_OPERATIONAL, next);
                  }}
                />
                {operationalErrors.backlogThreshold ? (
                  <p className="font-sans text-xs text-[#F39A9A]">
                    {operationalErrors.backlogThreshold}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_delay_override")}
                </span>
                <Select
                  value={operationalDraft.delayOverrideState}
                  onValueChange={(value) => {
                    const next = {
                      ...operationalDraft,
                      delayOverrideState: value as ProductionDelayOverrideState,
                    };
                    setOperationalDraft(next);
                    dirty.updateSectionDraft(SECTION_OPERATIONAL, next);
                  }}
                  disabled={!isSystemAdmin || savingAnySection}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{tAdmin("system_settings_delay_auto")}</SelectItem>
                    <SelectItem value="force_active">
                      {tAdmin("system_settings_delay_force_active")}
                    </SelectItem>
                    <SelectItem value="force_inactive">
                      {tAdmin("system_settings_delay_force_inactive")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_field_change_reason")}
                </span>
                <Textarea
                  rows={2}
                  value={operationalChangeReason}
                  disabled={!isSystemAdmin || savingAnySection}
                  onChange={(event) => setOperationalChangeReason(event.target.value)}
                  placeholder={tAdmin("system_settings_change_reason_hint")}
                />
                {operationalErrors.changeReason ? (
                  <p className="font-sans text-xs text-[#F39A9A]">
                    {operationalErrors.changeReason}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_delay_notes")}
                </span>
                <Textarea
                  rows={2}
                  value={operationalDraft.delayNotes}
                  disabled={!isSystemAdmin || savingAnySection}
                  onChange={(event) => {
                    const next = { ...operationalDraft, delayNotes: event.target.value };
                    setOperationalDraft(next);
                    dirty.updateSectionDraft(SECTION_OPERATIONAL, next);
                  }}
                />
              </div>

              <div className="rounded-lg border border-[#232323] bg-[#101010] p-3">
                <p className="font-sans text-xs uppercase tracking-[0.08em] text-[#8E8E8E]">
                  {tAdmin("system_settings_backlog_panel_title")}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-sans text-xs text-[#8E8E8E]">
                      {tAdmin("system_settings_backlog_count")}
                    </p>
                    <p className="font-display text-lg text-white">
                      {productionStatusQuery.status?.backlogCount ?? "--"}
                    </p>
                  </div>
                  <div>
                    <p className="font-sans text-xs text-[#8E8E8E]">
                      {tAdmin("system_settings_affected_users")}
                    </p>
                    <p className="font-display text-lg text-white">
                      {productionStatusQuery.status?.affectedUserCount ?? "--"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={
                    !isSystemAdmin || savingAnySection || !dirty.isSectionDirty(SECTION_OPERATIONAL)
                  }
                  onClick={() => void handleSaveOperationalSection()}
                  className="min-h-11 rounded-full"
                >
                  {savingAnySection ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {tAdmin("system_settings_save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingAnySection || !dirty.isSectionDirty(SECTION_OPERATIONAL)}
                  onClick={resetOperationalSection}
                  className="min-h-11 rounded-full"
                >
                  {tCommon("cancel")}
                </Button>
              </div>
            </div>
          </article>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
          <article className="rounded-[1.4rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#0A0A0A_0%,#060606_100%)] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-white">
                {tAdmin("system_settings_section_content_controls")}
              </h2>
              {dirty.isSectionDirty(SECTION_CONTENT_CONTROLS) ? (
                <Badge className="border-[#204B2A] bg-[#102015] text-[#99E4AB]">
                  {tAdmin("system_settings_dirty_badge")}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_content_about_heading")}
                </span>
                <Input
                  value={contentDraft.aboutHeading}
                  disabled={!canEditKey(SETTING_KEYS.content_about_blocks) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...contentDraft, aboutHeading: event.target.value };
                    setContentDraft(next);
                    dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                  }}
                />
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_content_about_summary")}
                </span>
                <Textarea
                  rows={3}
                  value={contentDraft.aboutSummary}
                  disabled={!canEditKey(SETTING_KEYS.content_about_blocks) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...contentDraft, aboutSummary: event.target.value };
                    setContentDraft(next);
                    dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                  }}
                />
              </div>

              <div className="grid gap-2 rounded-lg border border-[#232323] bg-[#111111] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs text-[#9F9F9F]">
                    {tAdmin("system_settings_content_about_sections")}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canEditKey(SETTING_KEYS.content_about_blocks) || savingAnySection}
                    onClick={() => {
                      const next = {
                        ...contentDraft,
                        aboutSections: [...contentDraft.aboutSections, { title: "", body: "" }],
                      };
                      setContentDraft(next);
                      dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                    }}
                  >
                    <Plus className="size-3" />
                    {tAdmin("system_settings_add")}
                  </Button>
                </div>

                {contentDraft.aboutSections.map((section, index) => (
                  <div
                    key={`${section.title.trim()}-${section.body.trim()}`}
                    className="grid gap-2 rounded-md border border-[#2A2A2A] p-2"
                  >
                    <Input
                      placeholder={tAdmin("system_settings_content_section_title")}
                      value={section.title}
                      disabled={!canEditKey(SETTING_KEYS.content_about_blocks) || savingAnySection}
                      onChange={(event) => {
                        const nextSections = contentDraft.aboutSections.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, title: event.target.value } : entry
                        );
                        const next = { ...contentDraft, aboutSections: nextSections };
                        setContentDraft(next);
                        dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                      }}
                    />
                    <Textarea
                      rows={2}
                      placeholder={tAdmin("system_settings_content_section_body")}
                      value={section.body}
                      disabled={!canEditKey(SETTING_KEYS.content_about_blocks) || savingAnySection}
                      onChange={(event) => {
                        const nextSections = contentDraft.aboutSections.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, body: event.target.value } : entry
                        );
                        const next = { ...contentDraft, aboutSections: nextSections };
                        setContentDraft(next);
                        dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="grid gap-2 rounded-lg border border-[#232323] bg-[#111111] p-3">
                <p className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_content_contact_block")}
                </p>
                <Input
                  placeholder={tAdmin("system_settings_content_contact_heading")}
                  value={contentDraft.contactHeading}
                  disabled={!canEditKey(SETTING_KEYS.content_contact_blocks) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...contentDraft, contactHeading: event.target.value };
                    setContentDraft(next);
                    dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                  }}
                />
                <Input
                  placeholder={tAdmin("system_settings_content_contact_email")}
                  value={contentDraft.contactEmail}
                  disabled={!canEditKey(SETTING_KEYS.content_contact_blocks) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...contentDraft, contactEmail: event.target.value };
                    setContentDraft(next);
                    dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                  }}
                />
                <Input
                  placeholder={tAdmin("system_settings_content_contact_phone")}
                  value={contentDraft.contactPhone}
                  disabled={!canEditKey(SETTING_KEYS.content_contact_blocks) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...contentDraft, contactPhone: event.target.value };
                    setContentDraft(next);
                    dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                  }}
                />
                <Textarea
                  rows={2}
                  placeholder={tAdmin("system_settings_content_contact_address")}
                  value={contentDraft.contactAddress}
                  disabled={!canEditKey(SETTING_KEYS.content_contact_blocks) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...contentDraft, contactAddress: event.target.value };
                    setContentDraft(next);
                    dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                  }}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !isSystemAdmin ||
                      savingAnySection ||
                      !canEditKey(SETTING_KEYS.content_contact_blocks) ||
                      !dirty.isSectionDirty(SECTION_CONTENT_CONTROLS)
                    }
                    onClick={() => void handleSaveContentContactBlock()}
                  >
                    {savingAnySection && contentSaveAction === "contact" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    {tAdmin("system_settings_save")}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border border-[#232323] bg-[#111111] p-3">
                <p className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_content_hero_block")}
                </p>
                <Input
                  placeholder={tAdmin("system_settings_content_hero_title")}
                  value={contentDraft.heroTitle}
                  disabled={
                    !canEditKey(SETTING_KEYS.content_homepage_hero_copy) || savingAnySection
                  }
                  onChange={(event) => {
                    const next = { ...contentDraft, heroTitle: event.target.value };
                    setContentDraft(next);
                    dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                  }}
                />
                <Textarea
                  rows={2}
                  placeholder={tAdmin("system_settings_content_hero_subtitle")}
                  value={contentDraft.heroSubtitle}
                  disabled={
                    !canEditKey(SETTING_KEYS.content_homepage_hero_copy) || savingAnySection
                  }
                  onChange={(event) => {
                    const next = { ...contentDraft, heroSubtitle: event.target.value };
                    setContentDraft(next);
                    dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                  }}
                />
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    placeholder={tAdmin("system_settings_content_hero_primary_cta")}
                    value={contentDraft.heroPrimaryCta}
                    disabled={
                      !canEditKey(SETTING_KEYS.content_homepage_hero_copy) || savingAnySection
                    }
                    onChange={(event) => {
                      const next = { ...contentDraft, heroPrimaryCta: event.target.value };
                      setContentDraft(next);
                      dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                    }}
                  />
                  <Input
                    placeholder={tAdmin("system_settings_content_hero_secondary_cta")}
                    value={contentDraft.heroSecondaryCta}
                    disabled={
                      !canEditKey(SETTING_KEYS.content_homepage_hero_copy) || savingAnySection
                    }
                    onChange={(event) => {
                      const next = { ...contentDraft, heroSecondaryCta: event.target.value };
                      setContentDraft(next);
                      dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                    }}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        !isSystemAdmin ||
                        savingAnySection ||
                        !canEditKey(SETTING_KEYS.content_homepage_hero_copy) ||
                        !dirty.isSectionDirty(SECTION_CONTENT_CONTROLS)
                      }
                      onClick={() => void handleSaveContentHeroBlock()}
                    >
                      {savingAnySection && contentSaveAction === "hero" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      {tAdmin("system_settings_save")}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border border-[#232323] bg-[#111111] p-3">
                <div className="flex items-center justify-between">
                  <p className="font-sans text-xs text-[#9F9F9F]">
                    {tAdmin("system_settings_content_faq_entries")}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canEditKey(SETTING_KEYS.content_faq_entries) || savingAnySection}
                    onClick={() => {
                      const next = {
                        ...contentDraft,
                        faqEntries: [...contentDraft.faqEntries, { question: "", answer: "" }],
                      };
                      setContentDraft(next);
                      dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                    }}
                  >
                    <Plus className="size-3" />
                    {tAdmin("system_settings_add")}
                  </Button>
                </div>
                {contentDraft.faqEntries.map((entry, index) => (
                  <div
                    key={`${entry.question.trim()}-${entry.answer.trim()}`}
                    className="grid gap-2 rounded-md border border-[#2A2A2A] p-2"
                  >
                    <Textarea
                      rows={2}
                      placeholder={tAdmin("system_settings_content_faq_question")}
                      value={entry.question}
                      disabled={!canEditKey(SETTING_KEYS.content_faq_entries) || savingAnySection}
                      onChange={(event) => {
                        const nextEntries = contentDraft.faqEntries.map((faq, faqIndex) =>
                          faqIndex === index ? { ...faq, question: event.target.value } : faq
                        );
                        const next = { ...contentDraft, faqEntries: nextEntries };
                        setContentDraft(next);
                        dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                      }}
                    />
                    <Textarea
                      rows={3}
                      placeholder={tAdmin("system_settings_content_faq_answer")}
                      value={entry.answer}
                      disabled={!canEditKey(SETTING_KEYS.content_faq_entries) || savingAnySection}
                      onChange={(event) => {
                        const nextEntries = contentDraft.faqEntries.map((faq, faqIndex) =>
                          faqIndex === index ? { ...faq, answer: event.target.value } : faq
                        );
                        const next = { ...contentDraft, faqEntries: nextEntries };
                        setContentDraft(next);
                        dirty.updateSectionDraft(SECTION_CONTENT_CONTROLS, next);
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={
                    !isSystemAdmin ||
                    savingAnySection ||
                    !dirty.isSectionDirty(SECTION_CONTENT_CONTROLS)
                  }
                  onClick={() => void handleSaveContentSection()}
                  className="min-h-11 rounded-full"
                >
                  {savingAnySection && contentSaveAction === "all" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {tAdmin("system_settings_save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingAnySection || !dirty.isSectionDirty(SECTION_CONTENT_CONTROLS)}
                  onClick={resetContentSection}
                  className="min-h-11 rounded-full"
                >
                  {tCommon("cancel")}
                </Button>
              </div>

              {Object.keys(contentErrors).length > 0 ? (
                <p className="font-sans text-xs text-[#F39A9A]">
                  {tAdmin("system_settings_fix_errors_before_save")}
                </p>
              ) : null}
            </div>
          </article>

          <article className="rounded-[1.4rem] border border-[#1D1D1D] bg-[linear-gradient(180deg,#0A0A0A_0%,#060606_100%)] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-white">
                {tAdmin("system_settings_section_seo_controls")}
              </h2>
              {dirty.isSectionDirty(SECTION_SEO_CONTROLS) ? (
                <Badge className="border-[#204B2A] bg-[#102015] text-[#99E4AB]">
                  {tAdmin("system_settings_dirty_badge")}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_seo_canonical_url")}
                </span>
                <Input
                  type="url"
                  value={seoDraft.canonicalBaseUrl}
                  disabled={!canEditKey(SETTING_KEYS.seo_canonical_base_url) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...seoDraft, canonicalBaseUrl: event.target.value };
                    setSeoDraft(next);
                    dirty.updateSectionDraft(SECTION_SEO_CONTROLS, next);
                  }}
                />
                {seoErrors.canonicalBaseUrl ? (
                  <p className="font-sans text-xs text-[#F39A9A]">{seoErrors.canonicalBaseUrl}</p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_seo_og_url")}
                </span>
                <Input
                  type="url"
                  value={seoDraft.ogFallbackImageUrl}
                  disabled={!canEditKey(SETTING_KEYS.seo_og_fallback_image_url) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...seoDraft, ogFallbackImageUrl: event.target.value };
                    setSeoDraft(next);
                    dirty.updateSectionDraft(SECTION_SEO_CONTROLS, next);
                  }}
                />
                {seoErrors.ogFallbackImageUrl ? (
                  <p className="font-sans text-xs text-[#F39A9A]">{seoErrors.ogFallbackImageUrl}</p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_seo_title_template")}
                </span>
                <Input
                  value={seoDraft.titleTemplate}
                  disabled={!canEditKey(SETTING_KEYS.seo_metadata_defaults) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...seoDraft, titleTemplate: event.target.value };
                    setSeoDraft(next);
                    dirty.updateSectionDraft(SECTION_SEO_CONTROLS, next);
                  }}
                />
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_seo_description")}
                </span>
                <Textarea
                  rows={3}
                  value={seoDraft.defaultDescription}
                  disabled={!canEditKey(SETTING_KEYS.seo_metadata_defaults) || savingAnySection}
                  onChange={(event) => {
                    const next = { ...seoDraft, defaultDescription: event.target.value };
                    setSeoDraft(next);
                    dirty.updateSectionDraft(SECTION_SEO_CONTROLS, next);
                  }}
                />
              </div>

              <div className="grid gap-1.5">
                <span className="font-sans text-xs text-[#9F9F9F]">
                  {tAdmin("system_settings_seo_robots")}
                </span>
                <Select
                  value={seoDraft.defaultRobots}
                  onValueChange={(value) => {
                    const next = {
                      ...seoDraft,
                      defaultRobots: value as "index,follow" | "noindex,nofollow",
                    };
                    setSeoDraft(next);
                    dirty.updateSectionDraft(SECTION_SEO_CONTROLS, next);
                  }}
                  disabled={!canEditKey(SETTING_KEYS.seo_metadata_defaults) || savingAnySection}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="index,follow">index,follow</SelectItem>
                    <SelectItem value="noindex,nofollow">noindex,nofollow</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border border-[#232323] bg-[#101010] p-3">
                <p className="font-sans text-xs uppercase tracking-[0.08em] text-[#8E8E8E]">
                  {tAdmin("system_settings_seo_preview")}
                </p>
                <p className="font-sans mt-2 text-sm text-[#78A9FF]">
                  {seoDraft.titleTemplate.replace("%s", "BookPrinta")}
                </p>
                <p className="font-sans mt-1 text-xs text-[#9D9D9D]">
                  {seoDraft.canonicalBaseUrl || "https://bookprinta.com"}
                </p>
                <p className="font-sans mt-2 text-sm text-[#D0D0D0]">
                  {seoDraft.defaultDescription}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={
                    !isSystemAdmin ||
                    savingAnySection ||
                    !dirty.isSectionDirty(SECTION_SEO_CONTROLS)
                  }
                  onClick={() => void handleSaveSeoSection()}
                  className="min-h-11 rounded-full"
                >
                  {savingAnySection ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  {tAdmin("system_settings_save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingAnySection || !dirty.isSectionDirty(SECTION_SEO_CONTROLS)}
                  onClick={resetSeoSection}
                  className="min-h-11 rounded-full"
                >
                  {tCommon("cancel")}
                </Button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <AlertDialog open={maintenanceConfirmOpen} onOpenChange={setMaintenanceConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tAdmin("system_settings_confirm_critical_change")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tAdmin("system_settings_maintenance_confirm_body")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-1.5">
            <span className="font-sans text-xs text-[#7F7F7F]">
              {tAdmin("system_settings_field_change_reason")}
            </span>
            <Textarea
              rows={3}
              value={operationalChangeReason}
              onChange={(event) => setOperationalChangeReason(event.target.value)}
              placeholder={tAdmin("system_settings_change_reason_hint")}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#007eff] text-white hover:bg-[#0066d1]"
              onClick={(event) => {
                event.preventDefault();
                void (async () => {
                  await persistOperationalSection(true);
                  setMaintenanceConfirmOpen(false);
                })();
              }}
            >
              {tAdmin("system_settings_confirm_continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
