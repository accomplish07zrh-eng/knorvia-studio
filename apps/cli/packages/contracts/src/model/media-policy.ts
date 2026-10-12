// SPDX-License-Identifier: Apache-2.0
// 媒体策略：判断某个内容块在 provider 眼里是否「看得见」，以及模型不支持该能力时怎么降级。
// 组织方式：每个判定拆成小步骤（先看块类型、再看媒体类型、最后看数据），
// 组合判定与「不支持哪一类」都走表，文案由一处模板生成。

import {
  modelMessageContentToText,
  type ModelInputFormat,
  type ModelMessageContentBlock,
} from "./index.js";

/** 模型不支持时对外报出的媒体类别；文案是外部可见的判定结论。 */
export type UnsupportedModelInputMediaKind = "image input" | "PDF input" | "video input";

const PDF_MEDIA_TYPE = "application/pdf";
const VIDEO_MEDIA_TYPE_PREFIX = "video/";
/** 占位文本取不到时的兜底；正常路径来自 modelMessageContentToText。 */
const FALLBACK_MEDIA_PLACEHOLDER = "[Attached media]";

/** 媒体类型可能带 `;charset=` 之类的参数，取分号前一段再比较。 */
function baseMediaType(mediaType: string): string {
  return (mediaType.split(";", 1)[0] ?? "").trim().toLowerCase();
}

/** provider-visible PDF：file 块 + `application/pdf` + 有数据 URL + 没有可用提取文本。 */
export function isProviderVisiblePdfModelInputBlock(block: ModelMessageContentBlock): boolean {
  if (block.type !== "file") return false;
  if (baseMediaType(block.mediaType) !== PDF_MEDIA_TYPE) return false;
  if (block.dataUrl === undefined) return false;
  // 只有非空提取文本能替代 provider-visible 的 PDF 文件数据；空串时 adapter 会回退发送 file-data。
  return block.text === undefined || block.text.length === 0;
}

/** provider-visible 视频：video/file 块 + `video/` 前缀媒体类型 + 有数据 URL。 */
export function isProviderVisibleVideoModelInputBlock(block: ModelMessageContentBlock): boolean {
  if (block.type !== "video" && block.type !== "file") return false;
  if (block.dataUrl === undefined) return false;
  return block.mediaType.toLowerCase().startsWith(VIDEO_MEDIA_TYPE_PREFIX);
}

/** 图片、provider-visible PDF 与 provider-visible 视频合起来才算「provider 看得见的媒体」。 */
export function isProviderVisibleModelInputMediaBlock(block: ModelMessageContentBlock): boolean {
  const visibleAsImage = block.type === "image";
  const visibleAsPdf = isProviderVisiblePdfModelInputBlock(block);
  const visibleAsVideo = isProviderVisibleVideoModelInputBlock(block);
  return visibleAsImage || visibleAsPdf || visibleAsVideo;
}

/** 一类媒体的能力检查：看得见 + 模型不支持 → 这一类要降级。 */
interface MediaCapabilityCheck {
  kind: UnsupportedModelInputMediaKind;
  isVisible: (block: ModelMessageContentBlock) => boolean;
  isSupported: (inputFormat: ModelInputFormat) => boolean;
}

const MEDIA_CAPABILITY_CHECKS: readonly MediaCapabilityCheck[] = [
  {
    kind: "image input",
    isVisible: (block) => block.type === "image",
    isSupported: (inputFormat) => inputFormat.supportsImage,
  },
  {
    kind: "PDF input",
    isVisible: isProviderVisiblePdfModelInputBlock,
    isSupported: (inputFormat) => inputFormat.supportsPdf,
  },
  {
    kind: "video input",
    isVisible: isProviderVisibleVideoModelInputBlock,
    isSupported: (inputFormat) => inputFormat.supportsVideo,
  },
];

/** 按表的顺序找第一类「看得见但模型不支持」的媒体；都支持则返回 undefined。 */
export function getUnsupportedModelInputMediaKind(
  block: ModelMessageContentBlock,
  inputFormat: ModelInputFormat,
): UnsupportedModelInputMediaKind | undefined {
  const unsupported = MEDIA_CAPABILITY_CHECKS.find(
    (check) => check.isVisible(block) && !check.isSupported(inputFormat),
  );
  return unsupported?.kind;
}

/** 降级说明的固定头与尾：中间嵌「不支持哪一类媒体」。两段拼接后的整句是外部可见文案。 */
const MEDIA_NOTICE_PREFIX =
  "[Media omitted from provider request because the selected model does not support ";
const MEDIA_NOTICE_SUFFIX = ".]";

/** 不支持媒体的降级说明整句。 */
function omittedMediaNotice(unsupportedKind: UnsupportedModelInputMediaKind): string {
  return `${MEDIA_NOTICE_PREFIX}${unsupportedKind}${MEDIA_NOTICE_SUFFIX}`;
}

export function createUnsupportedModelInputMediaText(
  block: ModelMessageContentBlock,
  unsupportedKind: UnsupportedModelInputMediaKind,
): string {
  const renderedText = modelMessageContentToText([block]);
  const placeholder = renderedText || FALLBACK_MEDIA_PLACEHOLDER;
  const notice = omittedMediaNotice(unsupportedKind);
  // 两段之间固定换行：占位文本先给读者一个「这里原本有什么」的交代，再给降级原因。
  return [placeholder, notice].join("\n");
}
