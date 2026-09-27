import { createKnorviaIcon } from "@/icons/createKnorviaIcon.js";
import type { Glyph } from "@/icons/knorviaGlyphs.js";

// 用户提供的窗口图形保持原几何；经 Knorvia 图标基座渲染，
// 与其他小图标一样继承主题前景色、全局线宽和纸片底（specs/knorvia-icon-language.md）。
const TINT = {
  className: "knorvia-icon-tint",
  fill: "currentColor",
  fillOpacity: 0.1,
  stroke: "none",
} as const;

const MAXIMIZE_FRAME =
  "M17.4444 5H6.55556C5.69645 5 5 5.69645 5 6.55556V17.4444C5 18.3036 5.69645 19 6.55556 19H17.4444C18.3036 19 19 18.3036 19 17.4444V6.55556C19 5.69645 18.3036 5 17.4444 5Z";

const WINDOW_MAXIMIZE: Glyph = [
  ["path", { d: MAXIMIZE_FRAME, ...TINT }],
  ["path", { d: MAXIMIZE_FRAME }],
];

const WINDOW_RESTORE: Glyph = [
  ["path", { d: "M9 5H13C16.3137 5 19 7.68629 19 11V15" }],
  ["rect", { x: 5, y: 9, width: 10, height: 10, rx: 2, ...TINT }],
  ["rect", { x: 5, y: 9, width: 10, height: 10, rx: 2 }],
];

export const WindowMaximizeIcon = createKnorviaIcon("WindowMaximize", WINDOW_MAXIMIZE);
export const WindowRestoreIcon = createKnorviaIcon("WindowRestore", WINDOW_RESTORE);
