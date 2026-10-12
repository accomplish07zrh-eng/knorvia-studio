// SPDX-License-Identifier: Apache-2.0
// AskUserQuestion 的 HTML 预览校验（实现逻辑，不属兼容面）。
//
// 组织方式（替换阶段的自主决定）：四条正则 + 规则表。旧实现把三条检查写成顺序 if，
// 这里改成「先判断这段文本是不是 HTML 预览，再逐条匹配规则」——规则与文案同处一行，
// 新增一条检查只需在表里加一项。
import { z } from "zod";

// 四条正则各有分工，且都只在本地使用，不外泄为公开 API：
//   MARKER  —— 这段文本是否「像 HTML 预览」（doctype、注释或任意标签），不是就整体放行；
//   TAG     —— 是否存在至少一个标签（碎片形态的最低要求）；
//   DOCUMENT—— 是否含 doctype/html/body（预览必须是碎片而不是整页文档）；
//   SCRIPT  —— 是否含 script/style（预览里不允许可执行或样式块）。
// 判定「这段文本像 HTML 预览」：doctype、注释或任意标签。
const HTML_PREVIEW_MARKER_PATTERN = /<!doctype\b|<!--|<\/?\s*[a-z][a-z0-9:-]*(?:\s[^<>]*)?>/i;
const HTML_PREVIEW_TAG_PATTERN = /<\/?\s*[a-z][a-z0-9:-]*(?:\s[^<>]*)?>/i;
const HTML_PREVIEW_DOCUMENT_PATTERN = /<!doctype\b|<\/?\s*(?:html|body)\b/i;
const HTML_PREVIEW_SCRIPT_STYLE_PATTERN = /<\/?\s*(?:script|style)\b/i;

// 每条规则携带自己的错误文案：文案是模型可见契约，逐字冻结。
interface PreviewRule {
  matches: (preview: string) => boolean;
  message: string;
}

// 每条规则的 message 就是模型看到的错误文案，逐字冻结。
const PREVIEW_RULES: readonly PreviewRule[] = [
  {
    matches: (preview) => HTML_PREVIEW_DOCUMENT_PATTERN.test(preview),
    message: "HTML preview must be a fragment without html, body, or doctype",
  },
  {
    matches: (preview) => HTML_PREVIEW_SCRIPT_STYLE_PATTERN.test(preview),
    message: "HTML preview cannot contain script or style tags",
  },
  {
    matches: (preview) => !HTML_PREVIEW_TAG_PATTERN.test(preview),
    message: "HTML preview must contain an HTML tag",
  },
];

// 校验顺序无关：三条规则互不排斥，一条预览可以同时触发多条（例如整篇文档里既含 body
// 又含 script）。marker 判定放在最前，避免把普通说明文字当成 HTML 去挑毛病。
export function validateAskUserQuestionPreview(preview: string, context: z.RefinementCtx): void {
  // 不是 HTML 预览的普通文本直接放行；是预览就必须逐条通过上面的规则。
  if (!HTML_PREVIEW_MARKER_PATTERN.test(preview)) return;
  for (const rule of PREVIEW_RULES) {
    if (!rule.matches(preview)) continue;
    addPreviewIssue(context, rule.message);
  }
}

// 预览相关的 issue 一律落在 preview 路径上；集中构造，调用点只关心文案。
function addPreviewIssue(context: z.RefinementCtx, message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, message, path: ["preview"] });
}
