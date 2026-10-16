// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import {
  clippedText,
  enumFromCsv,
  nonEmptyText,
  strictFields,
  yesNo,
} from "./internal-s03/strict-shape.js";

/** 单次后台采样能进协议的字节上限。完整输出留在文件里。 */
export const BACKGROUND_BASH_OUTPUT_MAX_BYTES = 8 * 1024;

type OutputStatus = "running" | "completed" | "failed" | "timed_out" | "cancelled" | "spawn_error";
type QueryFault = "unavailable" | "unsupported" | "read_failed";

const OUTPUT_STATUS_CSV = "running,completed,failed,timed_out,cancelled,spawn_error";
const QUERY_FAULT_CSV = "unavailable,unsupported,read_failed";
const OUTPUT_KIND = "output" as const;

export const backgroundBashOutputSchema = strictFields({
  kind: z.literal(OUTPUT_KIND),
  workId: nonEmptyText,
  status: enumFromCsv<OutputStatus>(OUTPUT_STATUS_CSV),
  output: clippedText(BACKGROUND_BASH_OUTPUT_MAX_BYTES),
  truncated: yesNo,
  outputPath: nonEmptyText,
});

const optionalCode = z.string().optional();

const backgroundBashFaultSchema = strictFields({
  kind: enumFromCsv<QueryFault>(QUERY_FAULT_CSV),
  workId: nonEmptyText,
  code: optionalCode,
});

export const backgroundBashOutputResultSchema = z.union([
  backgroundBashOutputSchema,
  backgroundBashFaultSchema,
]);

export type BackgroundBashOutput = z.output<typeof backgroundBashOutputSchema>;
export type BackgroundBashOutputResult = z.output<typeof backgroundBashOutputResultSchema>;
