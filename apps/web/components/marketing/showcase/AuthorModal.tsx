"use client";

import { ExternalLinkIcon, GlobeIcon, MessageCircleIcon, ShoppingBagIcon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthorProfile } from "@/hooks/use-showcase";
import type { AuthorProfile, ShowcaseEntry } from "@/types/showcase";

interface AuthorModalProps {
  entry: ShowcaseEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthorModal({ entry, open, onOpenChange }: AuthorModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const { data: profile, isLoading } = useAuthorProfile(open && entry ? entry.id : null);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] rounded-t-none border-t border-border/30 bg-background px-0"
        >
          <SheetHeader className="px-6">
            <SheetTitle className="font-display text-lg font-bold tracking-tight">
              {entry?.authorName}
            </SheetTitle>
            <SheetDescription className="sr-only">{entry?.authorName}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-full max-h-[calc(85dvh-5rem)] px-6 pb-8" data-lenis-prevent>
            <AuthorProfileContent entry={entry} profile={profile ?? null} isLoading={isLoading} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/30 bg-background p-0">
        <div className="p-6 md:p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold tracking-tight">
              {entry?.authorName}
            </DialogTitle>
            <DialogDescription className="sr-only">{entry?.authorName}</DialogDescription>
          </DialogHeader>
          <AuthorProfileContent entry={entry} profile={profile ?? null} isLoading={isLoading} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AuthorProfileContent({
  entry,
  profile,
  isLoading,
}: {
  entry: ShowcaseEntry | null;
  profile: AuthorProfile | null;
  isLoading: boolean;
}) {
  const t = useTranslations("showcase");

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 pt-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 shrink-0 bg-muted" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!profile || !entry) return null;

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Author header */}
      <div className="flex items-center gap-4">
        {profile.profileImageUrl ? (
          <Image
            src={profile.profileImageUrl}
            alt={entry.authorName}
            width={64}
            height={64}
            className="size-16 shrink-0 object-cover"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center bg-primary">
            <span className="font-display text-lg font-bold text-primary-foreground">
              {entry.authorName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div>
          <h4 className="font-display text-base font-bold tracking-tight text-foreground">
            {entry.authorName}
          </h4>
          <p className="font-sans text-sm text-muted-foreground">{entry.bookTitle}</p>
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <p className="font-serif text-sm leading-relaxed text-foreground/70">{profile.bio}</p>
      )}

      {/* Contact links */}
      <div className="flex flex-col gap-3">
        {/* WhatsApp */}
        {profile.whatsAppNumber && (
          <a
            href={`https://wa.me/${profile.whatsAppNumber.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-sans text-sm font-semibold text-accent transition-colors duration-200 hover:text-accent/80"
          >
            <MessageCircleIcon className="size-4" aria-hidden="true" />
            {t("contact_whatsapp")}
          </a>
        )}

        {/* Website */}
        {profile.websiteUrl && (
          <a
            href={profile.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-sans text-sm font-semibold text-accent transition-colors duration-200 hover:text-accent/80"
          >
            <GlobeIcon className="size-4" aria-hidden="true" />
            {t("visit_website")}
          </a>
        )}
      </div>

      {/* Purchase links */}
      {profile.purchaseLinks && profile.purchaseLinks.length > 0 && (
        <div className="flex flex-col gap-3">
          <h5 className="flex items-center gap-1.5 font-sans text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
            <ShoppingBagIcon className="size-3.5" aria-hidden="true" />
            {t("buy_book")}
          </h5>
          <div className="flex flex-wrap gap-2">
            {profile.purchaseLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 border border-border/50 px-3.5 py-2 font-sans text-xs font-semibold text-foreground transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
              >
                {link.label}
                <ExternalLinkIcon className="size-3" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Social links */}
      {profile.socialLinks && profile.socialLinks.length > 0 && (
        <div className="flex flex-col gap-3">
          <h5 className="font-sans text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("socials")}
          </h5>
          <div className="flex flex-wrap gap-2">
            {profile.socialLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-muted px-3.5 py-2 font-sans text-xs font-semibold text-foreground transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
              >
                {link.platform}
                <ExternalLinkIcon className="size-3" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
