// SPDX-License-Identifier: Apache-2.0
// Source-exposed B5 replacement candidate; inherited presentation contract retained.
import { useEffect, useReducer } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/components/lib/utils.js";
import { observeMetricMotion } from "./flip-metric-preference.js";

const slot = "inline-flex h-[1.15em] shrink-0 items-center justify-center leading-none";
const flip = {
  initial: { rotateX: -90, y: "-0.45em", opacity: 0 },
  animate: { rotateX: 0, y: 0, opacity: 1 },
  exit: { rotateX: 90, y: "0.45em", opacity: 0 },
  transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
} as const;

function describeMetric(value: string) {
  return Array.from(value, (glyph, position) => {
    const ascii = glyph.codePointAt(0)!;
    const digit = ascii >= 48 && ascii <= 57;
    const width = digit
      ? "w-[0.66em]"
      : glyph === ":" || glyph === "."
        ? "w-[0.34em]"
        : "w-[0.7em]";
    return { glyph, position, digit, width };
  });
}

export function FlipMetricValue({
  value,
  className,
  animateInitial = false,
}: {
  value: string;
  className?: string;
  animateInitial?: boolean;
}) {
  const [reduced, preferenceChanged] = useReducer(
    (_current: boolean, next: boolean) => next,
    false,
  );
  useEffect(() => observeMetricMotion(preferenceChanged), []);
  return (
    <span
      aria-label={value}
      data-animate-initial={animateInitial ? "true" : undefined}
      className={cn(
        "inline-flex max-w-full items-center overflow-hidden whitespace-nowrap align-middle leading-none",
        className,
      )}
      role="text"
      title={value}
    >
      {describeMetric(value).map(({ glyph, position, digit, width }) => {
        const animated = digit && !reduced;
        return (
          <span
            key={position}
            aria-hidden="true"
            className={cn(
              animated
                ? "relative inline-flex h-[1.15em] shrink-0 items-center justify-center overflow-hidden leading-none [perspective:8em]"
                : slot,
              width,
            )}
          >
            {animated ? (
              <AnimatePresence initial={animateInitial}>
                <motion.span
                  key={`${position}-${glyph}`}
                  className="absolute inset-0 flex items-center justify-center leading-none"
                  {...flip}
                  style={{ transformOrigin: "50% 50%" }}
                >
                  {glyph}
                </motion.span>
              </AnimatePresence>
            ) : (
              glyph
            )}
          </span>
        );
      })}
    </span>
  );
}
