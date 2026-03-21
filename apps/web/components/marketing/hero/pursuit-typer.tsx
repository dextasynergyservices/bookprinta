"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

interface PursuitTyperProps {
  prefix: string;
  phrases: string[];
}

export function PursuitTyper({ prefix, phrases }: PursuitTyperProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex];

    if (!isDeleting && displayText === currentPhrase) {
      // Pause at full phrase, then start deleting
      const timer = setTimeout(() => setIsDeleting(true), 2000);
      return () => clearTimeout(timer);
    }

    if (isDeleting && displayText === "") {
      // Switch to next phrase
      setIsDeleting(false);
      setPhraseIndex((prev) => (prev + 1) % phrases.length);
      return;
    }

    const speed = isDeleting ? 40 : 80;
    const timer = setTimeout(() => {
      setDisplayText((prev) =>
        isDeleting ? prev.slice(0, -1) : currentPhrase.slice(0, prev.length + 1)
      );
    }, speed);

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, phraseIndex, phrases]);

  return (
    <span className="inline-flex items-baseline gap-1.5">
      {/* Small, subtle prefix */}
      <span className="text-xs text-primary-foreground/30 sm:text-sm">{prefix}</span>

      {/* Prominent typed value */}
      <AnimatePresence mode="wait">
        <motion.span
          key={phraseIndex}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 1 }}
          className="inline-block text-xl font-bold text-accent sm:text-2xl lg:text-3xl"
        >
          {displayText}
          <span className="inline-block w-[2px] animate-pulse bg-accent">&nbsp;</span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
