"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, Share, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export function getInstallBannerMotionProps(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0, y: 60 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 60 },
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
  };
}

export function PwaInstallBanner() {
  const tCommon = useTranslations("common");
  const prefersReducedMotion = useReducedMotion();
  const motionProps = getInstallBannerMotionProps(prefersReducedMotion);
  const { canShow, isIOS, install, dismiss } = useInstallPrompt();

  return (
    <AnimatePresence initial={false}>
      {canShow ? (
        <motion.div
          {...motionProps}
          role="complementary"
          aria-label={tCommon("pwa_install_title")}
          className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-md rounded-2xl border border-white/10 bg-[#0A0A0A] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] md:bottom-6 md:left-auto md:right-6"
        >
          {/* Dismiss button */}
          <button
            type="button"
            onClick={dismiss}
            aria-label={tCommon("pwa_install_dismiss")}
            className="absolute right-3 top-3 rounded-full p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-3 pr-6">
            {/* App icon */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black">
              <Image
                src="/icons/icon-192.png"
                alt="BookPrinta"
                width={36}
                height={36}
                className="rounded-lg"
              />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="font-display text-sm font-semibold text-white">
                {tCommon("pwa_install_title")}
              </h3>
              <p className="mt-0.5 font-sans text-xs leading-snug text-white/60">
                {tCommon("pwa_install_body")}
              </p>

              <div className="mt-3 flex items-center gap-2">
                {isIOS ? (
                  <p className="flex items-center gap-1.5 font-sans text-xs text-white/70">
                    <Share size={14} className="shrink-0 text-[#007AFF]" />
                    <span>{tCommon("pwa_install_ios_instructions")}</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={install}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 font-sans text-xs font-semibold text-[#0A0A0A] transition-colors hover:bg-white/90 active:bg-white/80"
                  >
                    <Download size={14} />
                    {tCommon("pwa_install_button")}
                  </button>
                )}

                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-lg px-3 py-2 font-sans text-xs font-medium text-white/50 transition-colors hover:text-white/80"
                >
                  {tCommon("pwa_install_later")}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
