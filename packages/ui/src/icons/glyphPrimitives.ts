/**
 * Knorvia 图标语言「丝带线」的基础构件与共享外形（见 specs/knorvia-icon-language.md）。
 *
 * 规则：24 网格、四周留 2.5 安全边；1.6 细线、圆端圆角；承载内容的外形是大圆角软板，
 * 下方垫一层同色低透明「纸片」底（tint）；部件之间保留呼吸间隙（放大镜柄、垃圾桶盖、魔杖尖端）；
 * 点用实心圆而不是零长度线段；装饰只用黑白深浅，不引入颜色。
 *
 * 键名使用 lucide-react 的图标名（规范名或别名均可），生成脚本会把同一字形的全部别名一起导出，
 * 保证 `AlertCircle` 与 `CircleAlert` 这类别名永远指向同一张新图。
 */

export type GlyphTag = "path" | "circle" | "rect" | "ellipse" | "line";
export type GlyphNode = [GlyphTag, Record<string, string | number>];
export type Glyph = readonly GlyphNode[];

/** 纸片底：由 CSS 变量 --knorvia-icon-tint 控制深浅，选中/悬停时加深。 */
export const TINT = {
  className: "knorvia-icon-tint",
  fill: "currentColor",
  fillOpacity: 0.1,
  stroke: "none",
} as const;

export const s = (d: string): GlyphNode => ["path", { d }];
export const t = (d: string): GlyphNode => ["path", { d, ...TINT }];
/** 同一路径：先铺纸片底，再描线。 */
export const ts = (d: string): GlyphNode[] => [t(d), s(d)];
export const c = (cx: number, cy: number, r: number): GlyphNode => ["circle", { cx, cy, r }];
export const tc = (cx: number, cy: number, r: number): GlyphNode[] => [
  ["circle", { cx, cy, r, ...TINT }],
  c(cx, cy, r),
];
export const r = (x: number, y: number, w: number, h: number, rx: number): GlyphNode => [
  "rect",
  { x, y, width: w, height: h, rx },
];
export const tr = (x: number, y: number, w: number, h: number, rx: number): GlyphNode[] => [
  ["rect", { x, y, width: w, height: h, rx, ...TINT }],
  r(x, y, w, h, rx),
];
/** 实心点：不依赖零长度线段的圆端渲染。 */
export const dot = (cx: number, cy: number, rad = 1.15): GlyphNode => [
  "circle",
  { cx, cy, r: rad, fill: "currentColor", stroke: "none" },
];

const round = (value: number) => Math.round(value * 100) / 100;
const polar = (cx: number, cy: number, radius: number, deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [round(cx + radius * Math.cos(rad)), round(cy + radius * Math.sin(rad))] as const;
};

/** 软齿轮：8 个圆润短齿，齿间用内圆弧连接。 */
function gearPath(): string {
  const teeth = 8;
  const inner = 6.9;
  const outer = 9;
  const baseHalf = 12;
  const topHalf = 7.5;
  const step = 360 / teeth;
  const parts: string[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    const [x0, y0] = polar(12, 12, inner, a - baseHalf);
    const [x1, y1] = polar(12, 12, outer, a - topHalf);
    const [x2, y2] = polar(12, 12, outer, a + topHalf);
    const [x3, y3] = polar(12, 12, inner, a + baseHalf);
    const [x4, y4] = polar(12, 12, inner, a + step - baseHalf);
    parts.push(
      `${i === 0 ? "M" : "L"}${x0} ${y0}L${x1} ${y1}A${outer} ${outer} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${inner} ${inner} 0 0 1 ${x4} ${y4}`,
    );
  }
  return `${parts.join("")}Z`;
}

/** 旋转对称的加载光线，透明度依次递减，旋转时形成拖尾。 */
export function loaderRays(): GlyphNode[] {
  return Array.from({ length: 8 }, (_, i) => {
    const deg = i * 45;
    const [x1, y1] = polar(12, 12, 4.2, deg);
    const [x2, y2] = polar(12, 12, 8.5, deg);
    return ["path", { d: `M${x1} ${y1}L${x2} ${y2}`, strokeOpacity: round(1 - i * 0.11) }];
  });
}

export const GEAR = gearPath();

// —— 常用外形 ——
export const BUBBLE =
  "M7.5 4.5h9a4 4 0 0 1 4 4V13a4 4 0 0 1-4 4H11l-4 3.5V17a3.5 3.5 0 0 1-3.5-3.5v-5a4 4 0 0 1 4-4z";
export const ROUND_BUBBLE =
  "M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.6 20.4l.9-4.3A8.5 8.5 0 1 1 20.5 12z";
export const FILE =
  "M13.8 3.5H7.5A2.5 2.5 0 0 0 5 6v12a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18V8.7z";
export const FILE_FOLD = "M13.8 3.5V7a1.7 1.7 0 0 0 1.7 1.7H19";
export const FOLDER =
  "M3.5 8.5V6.5A2.5 2.5 0 0 1 6 4h3.2a2 2 0 0 1 1.6.8l.9 1.2a2 2 0 0 0 1.6.8H18a2.5 2.5 0 0 1 2.5 2.5v8.2A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z";
export const CIRCLE: GlyphNode[] = tc(12, 12, 8.5);
export const TRIANGLE = "M10.3 4.6a2 2 0 0 1 3.4 0l7 12.1a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3z";
export const SHIELD = "M12 3.3l7 2.6v5.3c0 4.3-2.9 7.8-7 9.5-4.1-1.7-7-5.2-7-9.5V5.9z";
export const CLOUD = "M7.2 18.5h9.9a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.8a4.4 4.4 0 0 0 1.2 8.7z";
export const MAGNIFIER: GlyphNode[] = [...tc(10.5, 10.5, 6.5), s("M16.2 16.2l4.3 4.3")];
export const EYE =
  "M2.8 12.4a1 1 0 0 1 0-.8C4.3 7.8 7.9 5 12 5s7.7 2.8 9.2 6.6a1 1 0 0 1 0 .8C19.7 16.2 16.1 19 12 19s-7.7-2.8-9.2-6.6z";
export const TRAY = "M4 15.5V17a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1.5";
export const PLUGIN_BLOCKS: GlyphNode[] = [
  ...tr(3.5, 3.5, 7, 7, 2.2),
  ...tr(3.5, 13.5, 7, 7, 2.2),
  ...tr(13.5, 13.5, 7, 7, 2.2),
  ...ts(
    "M17 2.9l3.6 3.6a.7.7 0 0 1 0 1L17 11.1a.7.7 0 0 1-1 0l-3.6-3.6a.7.7 0 0 1 0-1L16 2.9a.7.7 0 0 1 1 0z",
  ),
];
export const BOT: GlyphNode[] = [
  ...tr(4, 8.5, 16, 11.5, 4),
  s("M12 8.5V6"),
  dot(12, 4.3, 1.3),
  s("M9 13v1.8M15 13v1.8M2 13.5v2.8M22 13.5v2.8"),
];
export const GLOBE: GlyphNode[] = [
  ...CIRCLE,
  s("M12 3.5c-2.3 2.4-3.5 5.2-3.5 8.5s1.2 6.1 3.5 8.5c2.3-2.4 3.5-5.2 3.5-8.5S14.3 5.9 12 3.5z"),
  s("M3.5 12h17"),
];
export const PANEL: GlyphNode[] = tr(3.5, 4, 17, 16, 3.5);
export const MONITOR: GlyphNode[] = [...tr(3, 4, 18, 12.5, 3), s("M12 16.5V20M8.5 20.5h7")];
export const LOCK_BODY: GlyphNode[] = tr(4.5, 10.5, 15, 10, 3);
export const SUN_RAYS =
  "M12 2.5V4M12 20v1.5M2.5 12H4M20 12h1.5M5.3 5.3l1 1M17.7 17.7l1 1M5.3 18.7l1-1M17.7 6.3l1-1";
