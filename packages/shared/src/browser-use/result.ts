// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";
import { browserBackendTypeSchema } from "./backend.js";
import {
  browserErrorCodeSchema,
  browserPageStateSchema,
  browserViewportSizeSchema,
} from "./command-metadata.js";
import { browserSnapshotSchema, browserSnapshotElementSchema } from "./snapshot.js";
import { field, strict } from "./wire-schema.js";

const activeLifecycles = ["active", "deliverable", "handoff"] as const;
const terminalPhases = ["completed", "failed", "cancelled"] as const;
export const browserTabSummarySchema = strict({
  tabId: field.text,
  url: field.text,
  title: field.text,
  viewport: browserViewportSizeSchema,
  active: field.flag.optional(),
  lifecycle: z.enum(activeLifecycles).optional(),
});
export const browserUserTabInfoSchema = strict({
  id: field.nonempty,
  lastOpened: field.text.optional(),
  tabGroup: field.text.optional(),
  title: field.text.optional(),
  url: field.text.optional(),
});
export const browserDialogSchema = strict({
  type: z.enum(["alert", "confirm", "prompt", "beforeunload"]),
  message: field.text,
  defaultPrompt: field.text.optional(),
});
export const browserResponseMetaSchema = strict({
  browserUse: z.literal(true),
  backendType: browserBackendTypeSchema,
  browserId: field.nonempty,
  browserGeneration: field.count,
  openTabIds: z.array(field.text),
  tabId: field.text.optional(),
  currentUrl: field.text.optional(),
  lifecycle: z.enum([...activeLifecycles, "closed"]).optional(),
});
export const browserRecordingArtifactSchema = strict({
  path: field.nonempty,
  mimeType: z.literal("video/webm"),
  ...browserViewportSizeSchema.shape,
  fps: field.positive,
  durationMs: field.nonnegative,
  frameCount: field.count,
});
export const browserRecordingJobSchema = strict({
  id: field.nonempty,
  status: z.enum(["running", ...terminalPhases]),
  phase: z.enum(["preparing", "capturing", "finalizing", ...terminalPhases]),
  progress: field.number.min(0).max(1),
  startedAt: field.nonnegative,
  updatedAt: field.nonnegative,
  artifact: browserRecordingArtifactSchema.optional(),
  error: field.text.optional(),
});

const image = strict({ base64: field.text, mimeType: z.literal("image/png") });
const error = strict({
  code: browserErrorCodeSchema,
  message: field.text,
  sideEffect: z.enum(["none", "uncertain"]).optional(),
});
// Transport result shape does not infer command success from the presence of an error.
export const browserCommandResultSchema = strict({
  ok: field.flag,
  state: browserPageStateSchema.optional(),
  snapshot: browserSnapshotSchema.optional(),
  image: image.optional(),
  tabs: z.array(browserTabSummarySchema).optional(),
  userTabs: z.array(browserUserTabInfoSchema).optional(),
  tab: browserTabSummarySchema.optional(),
  value: field.opaque.optional(),
  element: browserSnapshotElementSchema.optional(),
  dialog: browserDialogSchema.nullable().optional(),
  recording: browserRecordingJobSchema.optional(),
  error: error.optional(),
  meta: browserResponseMetaSchema.optional(),
  elapsedMs: field.nonnegative,
});
export type BrowserTabSummary = z.infer<typeof browserTabSummarySchema>;
export type BrowserUserTabInfo = z.infer<typeof browserUserTabInfoSchema>;
export type BrowserDialog = z.infer<typeof browserDialogSchema>;
export type BrowserResponseMeta = z.infer<typeof browserResponseMetaSchema>;
export type BrowserRecordingArtifact = z.infer<typeof browserRecordingArtifactSchema>;
export type BrowserRecordingJob = z.infer<typeof browserRecordingJobSchema>;
export type BrowserCommandResult = z.infer<typeof browserCommandResultSchema>;
