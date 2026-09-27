/**
 * Knorvia 图标语言「丝带线」字形表（见 specs/knorvia-icon-language.md）。
 * 键名使用 lucide-react 的图标名（规范名或别名均可），生成脚本会把同一字形的全部别名一起导出。
 * 新增字形写进 glyphs/ 下对应主题文件，再运行 node scripts/generate-knorvia-icons.mjs。
 */
import type { Glyph } from "./glyphPrimitives.js";
import { ACTION_GLYPHS } from "./glyphs/actions.js";
import { CONTENT_GLYPHS } from "./glyphs/content.js";
import { NAVIGATION_GLYPHS } from "./glyphs/navigation.js";

export type { Glyph, GlyphNode } from "./glyphPrimitives.js";

export const KNORVIA_GLYPHS = {
  ...NAVIGATION_GLYPHS,
  ...ACTION_GLYPHS,
  ...CONTENT_GLYPHS,
} as const satisfies Record<string, Glyph>;

export type KnorviaGlyphName = keyof typeof KNORVIA_GLYPHS;
