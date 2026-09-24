import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import { useKnorviaStore } from "@/store/StoreProvider.js";
import { resolveTheme } from "@/useTheme.js";
import type { Theme } from "@/useTheme.js";

interface ThemeHeroPalette {
  panel: string;
  meshBase: string;
  meshLight: string;
  glowPrimary: string;
  glowSecondary: string;
  heading: string;
  description: string;
}

// Knorvia 黑白视觉语言：主视觉只用纯净的黑、白与银灰光。
const KNORVIA_LIGHT_HERO: ThemeHeroPalette = {
  meshBase: "#f4f4f4",
  meshLight: "#c9ccd1",
  panel:
    "bg-[linear-gradient(180deg,#ffffff_0%,#f6f6f6_48%,#ececec_100%)] before:absolute before:inset-0 before:content-[''] before:bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.95),transparent_26%),radial-gradient(circle_at_78%_82%,rgba(0,0,0,0.05),transparent_32%)]",
  glowPrimary: "bg-black/5 mix-blend-multiply",
  glowSecondary: "bg-white/70 mix-blend-screen",
  heading: "text-[#0A0A0A]",
  description: "text-[#5A5A5A]",
};

const KNORVIA_DARK_HERO: ThemeHeroPalette = {
  meshBase: "#050505",
  meshLight: "#8c8c8c",
  panel:
    "bg-[linear-gradient(180deg,#0a0a0a_0%,#101010_48%,#151515_100%)] before:absolute before:inset-0 before:content-[''] before:bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.08),transparent_26%),radial-gradient(circle_at_78%_82%,rgba(255,255,255,0.05),transparent_32%)]",
  glowPrimary: "bg-white/8 mix-blend-screen",
  glowSecondary: "bg-white/5 mix-blend-screen",
  heading: "text-[#FAFAFA]",
  description: "text-[#A3A3A3]",
};

function getThemeHeroPalette(theme: Theme): ThemeHeroPalette {
  return theme === "light" || theme === "knorvia-light" ? KNORVIA_LIGHT_HERO : KNORVIA_DARK_HERO;
}

export function useResolvedThemeHeroPalette(): ThemeHeroPalette {
  const theme = useKnorviaStore((state) => state.theme);
  const resolvedTheme =
    theme === "system" ? (resolveTheme(theme) === "dark" ? "dark" : "light") : theme;

  return getThemeHeroPalette(resolvedTheme);
}

export function ThemeHeroVisual(props: {
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}) {
  const palette = useResolvedThemeHeroPalette();

  return (
    <div className={cn("relative overflow-hidden", palette.panel, props.className)}>
      <div
        className={cn(
          "pointer-events-none absolute left-[-12%] top-[18%] h-[42rem] w-[42rem] rounded-full blur-3xl",
          palette.glowPrimary,
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute right-[-18%] bottom-[-14%] h-[36rem] w-[36rem] rounded-full blur-3xl",
          palette.glowSecondary,
        )}
      />
      {props.children ? (
        <div className={cn("relative z-10", props.contentClassName)}>{props.children}</div>
      ) : null}
    </div>
  );
}
