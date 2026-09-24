import { memo, useId, type RefObject } from "react";
import { cn } from "@/components/lib/utils.js";
import { KNORVIA_HEAD, knorviaEyePath } from "./mascotArtwork.js";

export interface KnorviaRig {
  head: RefObject<SVGGElement | null>;
  eyes: RefObject<SVGGElement | null>;
  leftEye: RefObject<SVGPathElement | null>;
  rightEye: RefObject<SVGPathElement | null>;
  shadow: RefObject<SVGEllipseElement | null>;
}

/** Original, resolution-independent Knorvia artwork. Static icons never start an animation. */
export const KnorviaMark = memo(function KnorviaMark({
  className,
  companion = false,
  rig,
}: {
  className?: string;
  companion?: boolean;
  rig?: KnorviaRig;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={cn("shrink-0 overflow-visible", className)}
      viewBox={companion ? "0 0 120 116" : "9 8 103 96"}
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-knorvia-mark="true"
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="0.3" cy="0.08" r="0.97">
          <stop stopColor="#555960" />
          <stop offset="0.28" stopColor="#2b2d34" />
          <stop offset="0.66" stopColor="#101116" />
          <stop offset="0.9" stopColor="#090a0e" />
          <stop offset="1" stopColor="#25242e" />
        </radialGradient>
        <linearGradient
          id={`${id}-rim`}
          x1="15"
          y1="23"
          x2="108"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#cddce0" stopOpacity="0.65" />
          <stop offset="0.3" stopColor="#92d8d1" stopOpacity="0.2" />
          <stop offset="0.55" stopColor="#14151a" stopOpacity="0" />
          <stop offset="0.8" stopColor="#bea6e1" stopOpacity="0.52" />
          <stop offset="1" stopColor="#b2b6c6" stopOpacity="0.3" />
        </linearGradient>
        <radialGradient
          id={`${id}-sheen`}
          cx="0.26"
          cy="0.02"
          r="0.65"
          gradientTransform="translate(0 .01) scale(1 .7)"
        >
          <stop stopColor="white" stopOpacity="0.3" />
          <stop offset="0.64" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-eye`}>
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9f2ff" />
        </radialGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop stopColor="#12131d" stopOpacity="0.16" />
          <stop offset="1" stopColor="#12131d" stopOpacity="0" />
        </radialGradient>
        {companion ? (
          <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.7" />
          </filter>
        ) : null}
      </defs>
      {companion ? (
        <ellipse ref={rig?.shadow} cx="60" cy="110" rx="35" ry="4" fill={`url(#${id}-shadow)`} />
      ) : null}
      <g ref={rig?.head}>
        <path
          d={KNORVIA_HEAD}
          fill={`url(#${id}-body)`}
          stroke={`url(#${id}-rim)`}
          strokeWidth="0.75"
        />
        <path d={KNORVIA_HEAD} fill={`url(#${id}-sheen)`} />
        <g ref={rig?.eyes}>
          {companion ? (
            <g opacity="0.24" filter={`url(#${id}-glow)`}>
              <use href={`#${id}-left-eye`} />
              <use href={`#${id}-right-eye`} />
            </g>
          ) : null}
          <path
            id={`${id}-left-eye`}
            ref={rig?.leftEye}
            d={knorviaEyePath(42)}
            fill={`url(#${id}-eye)`}
          />
          <path
            id={`${id}-right-eye`}
            ref={rig?.rightEye}
            d={knorviaEyePath(78)}
            fill={`url(#${id}-eye)`}
          />
        </g>
      </g>
    </svg>
  );
});
