// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";
import { browserViewportInputSchema } from "./command-metadata.js";
import {
  browserMouseButtonSchema,
  browserPointSchema,
  elementState,
  optionalCoordinates,
} from "./input-fields.js";
import { directory, field, strict } from "./wire-schema.js";

const MAX_DURATION_MS = 90_000;
const MAX_SELECTOR_LENGTH = 2_000;
const duration = field.count.max(MAX_DURATION_MS);
const selector = field.identity.max(MAX_SELECTOR_LENGTH);
const delay = { delayAfterMs: duration.optional() };
const animated = { durationMs: duration.optional(), ...delay };
const target = { selector: selector.optional(), ...optionalCoordinates };

export const browserRecordingActionSchema = directory("type", {
  wait: { durationMs: duration },
  click: {
    ...target,
    button: browserMouseButtonSchema.optional(),
    doubleClick: field.flag.optional(),
    ...delay,
  },
  type: { selector, text: field.text.max(100_000), ...delay },
  hover: { ...target, ...animated },
  move: { ...browserPointSchema.shape, ...animated },
  scroll: { deltaX: field.number.optional(), deltaY: field.number, ...animated },
  scrollTo: { ...target, ...animated },
  wheel: {
    deltaX: field.number.optional(),
    deltaY: field.number,
    times: z.number().int().min(1).max(100).optional(),
    intervalMs: duration.optional(),
    ...delay,
  },
  drag: { path: z.array(browserPointSchema).min(2).max(200), ...animated },
  waitFor: {
    selector,
    state: elementState.optional(),
    timeoutMs: field.positiveInt.max(30_000).optional(),
    ...delay,
  },
});
export const browserRecordingOptionsSchema = strict({
  viewport: browserViewportInputSchema.optional(),
  fps: z.number().int().min(1).max(60).optional(),
  jpegQuality: z.number().int().min(1).max(100).optional(),
  maxDurationMs: z.number().int().min(1_000).max(MAX_DURATION_MS).optional(),
  settleMs: duration.optional(),
  showCursor: field.flag.optional(),
  actions: z.array(browserRecordingActionSchema).max(500).optional(),
});

// This validates a wire name only. The host must still resolve and contain the real path.
export const recordingOutputPath = field.identity
  .max(MAX_SELECTOR_LENGTH)
  .superRefine((value, context) => {
    const slash = (character: string | undefined) => character === "/" || character === "\\";
    const drive = /^[A-Za-z]$/u.test(value[0] ?? "") && value[1] === ":" && slash(value[2]);
    if (slash(value[0]) || drive)
      context.addIssue({
        code: "custom",
        message: "recording outputPath must be relative to the workspace",
      });
    const parts = value.replaceAll("\\", "/").split(/\/+/u);
    if (parts.some((part) => ["", ".", ".."].includes(part)))
      context.addIssue({
        code: "custom",
        message: "recording outputPath cannot escape the workspace",
      });
    if (value.slice(-5).toLowerCase() !== ".webm")
      context.addIssue({ code: "custom", message: "recording outputPath must end with .webm" });
  });
export type BrowserRecordingAction = z.infer<typeof browserRecordingActionSchema>;
export type BrowserRecordingOptions = z.infer<typeof browserRecordingOptionsSchema>;
