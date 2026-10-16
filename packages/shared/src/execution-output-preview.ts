// SPDX-License-Identifier: Apache-2.0
// Bash 有界输出预览。strict：多余字段不属于两端共用的预览线格式。
import { z } from "zod";

const OUTPUT_PREVIEW_MAX_CHARACTERS = 4096;

function boundedPreviewText(maxCharacters: number) {
  const text = z.string();
  return text.max(maxCharacters);
}

function nonNegativeInteger() {
  const numeric = z.number();
  return numeric.int().nonnegative();
}

const previewText = boundedPreviewText(OUTPUT_PREVIEW_MAX_CHARACTERS);
const previewCount = nonNegativeInteger();

export const executionOutputPreviewSchema = z.strictObject({
  text: previewText,
  fullText: previewText,
  totalLines: previewCount,
  totalBytes: previewCount,
  linesEstimated: z.boolean(),
});

export type ExecutionOutputPreview = z.infer<typeof executionOutputPreviewSchema>;
