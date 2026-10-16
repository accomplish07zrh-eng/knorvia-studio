// SPDX-License-Identifier: Apache-2.0
// Scalars, workspace-key checks, and attachment branches shared by stream events and owner commands.
import { z } from "zod";
import type { RefinementCtx } from "zod";
import { strictShape, unionOf, type WireField } from "./wire-fields.js";

export function asWire<T>(schema: z.ZodType): z.ZodType<T> {
  return schema as unknown as z.ZodType<T>;
}

export const trimmed = z.string().trim().min(1);
export const plain = z.string();
export const whole = z.number().int().nonnegative();
export const positive = z.number().int().positive();

export function wireEnum(values: readonly string[]) {
  return z.enum(values as unknown as [string, ...string[]]);
}

const WORKSPACE_KEY_RULE = "workspaceKey must match workspaceIdentity fallback rule";
const RUN_TRACE_RULE = "runId must match traceId";
const REMOTE_REVIEW_RULE = "remote workspace Hook review response requires workspaceIdentity";

type WorkspaceScope = {
  workspacePath: string;
  workspaceIdentity?: string;
};

type KeyedWorkspace = WorkspaceScope & { workspaceKey: string };

type TracedRun = { runId: string; traceId: string };

export function resolveWorkspaceKey(scope: WorkspaceScope): string {
  const trimmedIdentity = scope.workspaceIdentity?.trim();
  if (trimmedIdentity) return trimmedIdentity;
  return scope.workspacePath;
}

function report(ctx: RefinementCtx, path: string, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

export function enforceWorkspaceKey(value: KeyedWorkspace, ctx: RefinementCtx): void {
  if (value.workspaceKey === resolveWorkspaceKey(value)) return;
  report(ctx, "workspaceKey", WORKSPACE_KEY_RULE);
}

function enforceRunTrace(value: TracedRun, ctx: RefinementCtx): void {
  if (value.runId === value.traceId) return;
  report(ctx, "runId", RUN_TRACE_RULE);
}

export function enforceTarget(value: KeyedWorkspace & TracedRun, ctx: RefinementCtx): void {
  enforceWorkspaceKey(value, ctx);
  enforceRunTrace(value, ctx);
}

export function enforceRealtimeEvent(
  value: KeyedWorkspace & { type: string; runId?: string; traceId?: string },
  ctx: RefinementCtx,
): void {
  enforceWorkspaceKey(value, ctx);
  if (value.type !== "task_stream_mirror_batch") return;
  if (value.runId === undefined || value.traceId === undefined) return;
  enforceRunTrace({ runId: value.runId, traceId: value.traceId }, ctx);
}

export function enforceRemoteReview(
  value: { remoteSessionId?: string; workspaceIdentity?: string },
  ctx: RefinementCtx,
): void {
  if (!value.remoteSessionId || value.workspaceIdentity) return;
  report(ctx, "workspaceIdentity", REMOTE_REVIEW_RULE);
}

function mediaFields(kind: "image" | "video" | "pdf"): WireField[] {
  return [
    ["kind", z.literal(kind)],
    ["filename", plain],
    ["mimeType", plain],
    ["sizeBytes", whole.optional()],
    ["dataBase64", plain.optional()],
    ["localPath", plain.optional()],
  ];
}

const audioFields: WireField[] = [
  ["kind", z.literal("audio")],
  ["filename", plain],
  ["mimeType", plain],
  ["dataBase64", plain.optional()],
  ["localPath", plain.optional()],
];

const fileFields: WireField[] = [
  ["kind", z.literal("file")],
  ["filename", plain],
  ["mimeType", plain],
  ["sizeBytes", whole],
  ["dataBase64", plain.optional()],
  ["textContent", plain.optional()],
  ["localPath", plain.optional()],
];

export const attachmentSchema = unionOf("kind", [
  strictShape(mediaFields("image")),
  strictShape(audioFields),
  strictShape(mediaFields("video")),
  strictShape(mediaFields("pdf")),
  strictShape(fileFields),
]);
