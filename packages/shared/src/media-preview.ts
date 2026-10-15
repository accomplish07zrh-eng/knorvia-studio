// SPDX-License-Identifier: Apache-2.0
// renderer 与 Host 共用的媒体预览格式表（B16）。
const MEDIA_KIND_VALUES = ["audio", "video"] as const;
export type MediaPreviewKind = (typeof MEDIA_KIND_VALUES)[number];

export type MediaPreviewFormat = {
  extension: /* 小写扩展名（含点） */ string;
  kind: /* 音频或视频 */ MediaPreviewKind;
  mediaType: /* MIME 类型 */ string;
};

// [扩展名, 种类, MIME] 三元组装载；顺序即查找优先级（B16 格式表 11 项逐字冻结）。
const MEDIA_FORMAT_ROWS: ReadonlyArray<readonly [string, MediaPreviewKind, string]> = [
  [".mp4", "video", "video/mp4"],
  [".mov", "video", "video/quicktime"],
  [".webm", "video", "video/webm"],
  [".m4v", "video", "video/x-m4v"],
  [".mp3", "audio", "audio/mpeg"],
  [".wav", "audio", "audio/wav"],
  [".m4a", "audio", "audio/mp4"],
  [".ogg", "audio", "audio/ogg"],
  [".opus", "audio", "audio/opus"],
  [".flac", "audio", "audio/flac"],
  [".weba", "audio", "audio/webm"],
];

export const MEDIA_PREVIEW_FORMATS: readonly MediaPreviewFormat[] = MEDIA_FORMAT_ROWS.map(
  ([extension, kind, mediaType]) => ({ extension, kind, mediaType }),
);

export function getMediaPreviewFormat(filePath: string): MediaPreviewFormat | null {
  const loweredPath = filePath.replace(/\\/g, "/").toLowerCase();
  const matched = MEDIA_PREVIEW_FORMATS.find((format) => loweredPath.endsWith(format.extension));
  return matched ?? null;
}
