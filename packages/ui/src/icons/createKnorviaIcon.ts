import { createElement, forwardRef } from "react";
import { createLucideIcon, type LucideIcon, type LucideProps } from "lucide-react";
import type { Glyph } from "./knorviaGlyphs.js";

/**
 * 用 lucide 自己的 Icon 基座渲染 Knorvia 字形：size、color、strokeWidth、absoluteStrokeWidth、
 * aria 与 ref 的行为与原图标完全一致，调用方无需任何改动；额外挂上 `knorvia-icon` 供样式层识别。
 */
export function createKnorviaIcon(iconName: string, glyph: Glyph): LucideIcon {
  const Base = createLucideIcon(
    iconName,
    glyph.map(([tag, attrs], index) => [tag, { ...attrs, key: `${tag}-${index}` }]) as Parameters<
      typeof createLucideIcon
    >[1],
  );
  const Icon = forwardRef<SVGSVGElement, Omit<LucideProps, "ref">>(({ className, ...props }, ref) =>
    createElement(Base, {
      ...props,
      ref,
      className: className ? `knorvia-icon ${className}` : "knorvia-icon",
    }),
  );
  Icon.displayName = Base.displayName;
  return Icon;
}
