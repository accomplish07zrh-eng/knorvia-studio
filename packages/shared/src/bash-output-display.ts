// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import { clippedText, nonEmptyText, strictFields, yesNo } from "./internal-s03/strict-shape.js";

/** 展示通道只放截断后的头部，以及输出文件是否被保留。 */
const DISPLAY_TEXT_CAP = 150_000;
const DISPLAY_PATH_CAP = 32_768;
const DISPLAY_KIND = "bash_output" as const;

export const bashOutputDisplaySchema = strictFields({
  kind: z.literal(DISPLAY_KIND),
  output: clippedText(DISPLAY_TEXT_CAP),
  truncated: yesNo,
  outputPath: nonEmptyText.max(DISPLAY_PATH_CAP).optional(),
});
