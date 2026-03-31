import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

export type MarketingSocialLink = {
  label: string;
  url: string;
};

type SocialPlatform =
  | "instagram"
  | "linkedin"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "whatsapp"
  | "x"
  | "generic";

export const FOOTER_FALLBACK_SOCIAL_LINKS: MarketingSocialLink[] = [
  { label: "LinkedIn", url: "https://linkedin.com/company/bookprinta" },
  { label: "Instagram", url: "https://instagram.com/bookprinta" },
  { label: "X", url: "https://x.com/bookprinta" },
];

export const CONTACT_FALLBACK_SOCIAL_LINKS: MarketingSocialLink[] = [
  { label: "Instagram", url: "https://instagram.com/bookprinta" },
  { label: "Twitter / X", url: "https://x.com/bookprinta" },
  { label: "Facebook", url: "https://facebook.com/bookprinta" },
];

function normalizePlatform(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSocialPlatform(link: MarketingSocialLink): SocialPlatform {
  const normalizedLabel = normalizePlatform(link.label);
  const normalizedUrl = normalizePlatform(link.url);

  if (normalizedLabel.includes("instagram") || normalizedUrl.includes("instagram.com")) {
    return "instagram";
  }

  if (normalizedLabel.includes("linkedin") || normalizedUrl.includes("linkedin.com")) {
    return "linkedin";
  }

  if (normalizedLabel.includes("facebook") || normalizedUrl.includes("facebook.com")) {
    return "facebook";
  }

  if (
    normalizedLabel.includes("youtube") ||
    normalizedUrl.includes("youtube.com") ||
    normalizedUrl.includes("youtu.be")
  ) {
    return "youtube";
  }

  if (normalizedLabel.includes("tiktok") || normalizedUrl.includes("tiktok.com")) {
    return "tiktok";
  }

  if (
    normalizedLabel.includes("whatsapp") ||
    normalizedUrl.includes("whatsapp.com") ||
    normalizedUrl.includes("wa.me/")
  ) {
    return "whatsapp";
  }

  if (
    normalizedLabel === "x" ||
    normalizedLabel.includes("twitter") ||
    normalizedLabel.includes("twitter / x") ||
    normalizedLabel.includes("x / twitter") ||
    normalizedUrl.includes("x.com") ||
    normalizedUrl.includes("twitter.com")
  ) {
    return "x";
  }

  return "generic";
}

function SocialIcon({
  platform,
  className,
}: {
  platform: SocialPlatform;
  className?: string;
}): ReactElement {
  if (platform === "instagram") {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (platform === "linkedin") {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    );
  }

  if (platform === "facebook") {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    );
  }

  if (platform === "youtube") {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.582 6.186a2.504 2.504 0 00-1.76-1.77C18.254 4 12 4 12 4s-6.254 0-7.822.416a2.504 2.504 0 00-1.76 1.77C2 7.76 2 12 2 12s0 4.24.418 5.814a2.504 2.504 0 001.76 1.77C5.746 20 12 20 12 20s6.254 0 7.822-.416a2.504 2.504 0 001.76-1.77C22 16.24 22 12 22 12s0-4.24-.418-5.814zM10 15.464V8.536L16 12l-6 3.464z" />
      </svg>
    );
  }

  if (platform === "tiktok") {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.589 6.686a4.793 4.793 0 01-3.77-4.736h-3.063v12.645a2.896 2.896 0 11-2.896-2.895c.248 0 .49.03.722.086V8.672a6.01 6.01 0 00-.722-.043A5.99 5.99 0 1015.85 14.62V8.148a7.837 7.837 0 004.583 1.474V6.686h-.844z" />
      </svg>
    );
  }

  if (platform === "whatsapp") {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.05 4.91A9.82 9.82 0 0012.03 2a9.9 9.9 0 00-8.57 14.83L2 22l5.3-1.39a9.9 9.9 0 004.72 1.2h.01a9.9 9.9 0 007.02-16.9zm-7.02 15.13h-.01a8.2 8.2 0 01-4.18-1.14l-.3-.18-3.15.83.84-3.07-.2-.31a8.23 8.23 0 1114.97-4.53 8.17 8.17 0 01-7.97 8.4zm4.52-6.16c-.25-.13-1.47-.73-1.7-.81-.23-.08-.4-.13-.56.13-.16.25-.64.81-.78.98-.14.17-.29.19-.54.06-.25-.13-1.04-.38-1.98-1.21-.73-.65-1.22-1.45-1.36-1.7-.14-.25-.01-.38.11-.5.11-.11.25-.29.38-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.09s.9 2.42 1.02 2.59c.13.17 1.77 2.69 4.29 3.77.6.26 1.08.42 1.45.54.61.19 1.17.16 1.61.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29z" />
      </svg>
    );
  }

  if (platform === "x") {
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        d="M10 14a5 5 0 007.07 0l1.41-1.41a5 5 0 10-7.07-7.07L10.59 7M14 10a5 5 0 00-7.07 0l-1.41 1.41a5 5 0 007.07 7.07L13.41 17"
      />
    </svg>
  );
}

type MarketingSocialLinkListProps = {
  links?: MarketingSocialLink[] | null;
  fallbackLinks?: MarketingSocialLink[];
  className?: string;
  linkClassName?: string;
  iconClassName?: string;
};

export function MarketingSocialLinkList({
  links,
  fallbackLinks = [],
  className,
  linkClassName,
  iconClassName,
}: MarketingSocialLinkListProps) {
  const managedLinks = (links ?? [])
    .map((entry) => ({
      label: entry.label.trim(),
      url: entry.url.trim(),
    }))
    .filter((entry) => entry.label.length > 0 && entry.url.length > 0);

  const resolvedLinks = managedLinks.length > 0 ? managedLinks : fallbackLinks;

  if (resolvedLinks.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {resolvedLinks.map((social) =>
        (() => {
          const platform = resolveSocialPlatform(social);

          return (
            <a
              key={`${social.label}:${social.url}`}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.label}
              data-social-platform={platform}
              className={cn(
                "flex size-10 items-center justify-center rounded-full transition-colors",
                linkClassName
              )}
            >
              <SocialIcon platform={platform} className={cn("size-5", iconClassName)} />
              <span className="sr-only">{social.label}</span>
            </a>
          );
        })()
      )}
    </div>
  );
}
