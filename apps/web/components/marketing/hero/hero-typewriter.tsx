"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export interface TypewriterSegment {
  /** The text for this segment */
  text: string;
  /** Optional CSS class (e.g. "font-display" or "font-serif italic") */
  className?: string;
  /** Optional inline styles to force font overrides */
  style?: React.CSSProperties;
}

interface HeroTypewriterProps {
  /** Ordered segments to type out sequentially */
  segments: TypewriterSegment[];
  /** Called once after the last character is typed */
  onComplete?: () => void;
  className?: string;
  /** Milliseconds per character (0 = instant / reduced motion) */
  speed?: number;
  /** Delay before typing starts */
  startDelay?: number;
}

/** Flatten segments into a single string for total length / sr-only text */
function flatText(segments: TypewriterSegment[]): string {
  return segments.map((s) => s.text).join("");
}

export function HeroTypewriter({
  segments,
  onComplete,
  className,
  speed = 60,
  startDelay = 600,
}: HeroTypewriterProps) {
  const fullText = flatText(segments);
  const [charIndex, setCharIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const completedRef = useRef(false);

  /* ── Instant reveal for reduced-motion or speed=0 ── */
  useEffect(() => {
    if (speed === 0) {
      setCharIndex(fullText.length);
      setStarted(true);
    }
  }, [speed, fullText.length]);

  /* ── Start delay ── */
  useEffect(() => {
    if (speed === 0) return;
    const timer = setTimeout(() => setStarted(true), startDelay);
    return () => clearTimeout(timer);
  }, [startDelay, speed]);

  /* ── Type characters one by one ── */
  useEffect(() => {
    if (!started || charIndex >= fullText.length || speed === 0) return;

    const timer = setTimeout(() => {
      setCharIndex((prev) => prev + 1);
    }, speed);

    return () => clearTimeout(timer);
  }, [charIndex, fullText.length, speed, started]);

  /* ── Fire onComplete once ── */
  useEffect(() => {
    if (charIndex >= fullText.length && !completedRef.current) {
      completedRef.current = true;
      const timer = setTimeout(() => onComplete?.(), 400);
      return () => clearTimeout(timer);
    }
  }, [charIndex, fullText.length, onComplete]);

  const isComplete = charIndex >= fullText.length;

  /* ── Build visible segments sliced to charIndex ── */
  let remaining = charIndex;
  const visibleSegments: {
    key: string;
    text: string;
    className?: string;
    style?: React.CSSProperties;
  }[] = [];

  for (let idx = 0; idx < segments.length; idx++) {
    if (remaining <= 0) break;
    const seg = segments[idx];
    const slice = seg.text.slice(0, remaining);
    visibleSegments.push({
      key: `${idx}-${seg.text}`,
      text: slice,
      className: seg.className,
      style: seg.style,
    });
    remaining -= slice.length;
  }

  return (
    <span className={className}>
      {/* Full text for screen readers */}
      <span className="sr-only">{fullText}</span>
      {/* Visual typewriter hidden from screen readers */}
      <span aria-hidden="true">
        {visibleSegments.map((seg) => (
          <span key={seg.key} className={seg.className} style={seg.style}>
            {seg.text}
          </span>
        ))}
        {!isComplete && (
          <motion.span
            className="ml-0.5 inline-block w-[3px] bg-accent align-baseline"
            style={{ height: "0.85em" }}
            animate={{ opacity: [1, 0] }}
            transition={{
              duration: 0.53,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: "reverse",
            }}
          />
        )}
      </span>
    </span>
  );
}
