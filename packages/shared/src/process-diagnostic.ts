// SPDX-License-Identifier: Apache-2.0
// Corrupt diagnostic frames must not throw: stdout may already be a live protocol.
import { z } from "zod";
import { strictShape } from "./internal-s03/wire-fields.js";

const LIMITS = {
  name: 128,
  message: 4_000,
  stack: 16_000,
  line: 128 * 1024,
} as const;

const EXCEPTION_BANNER = "[knorvia-process-exception] ";
const LIFECYCLE_BANNER = "[agent-lifecycle-reported]";

export const KNORVIA_PROCESS_DIAGNOSTIC_PREFIX = EXCEPTION_BANNER;
export const KNORVIA_PROCESS_DIAGNOSTIC_NAME_MAX_CHARS = LIMITS.name;
export const KNORVIA_PROCESS_DIAGNOSTIC_MESSAGE_MAX_CHARS = LIMITS.message;
export const KNORVIA_PROCESS_DIAGNOSTIC_STACK_MAX_CHARS = LIMITS.stack;
export const KNORVIA_PROCESS_DIAGNOSTIC_MAX_LINE_CHARS = LIMITS.line;
export const KNORVIA_AGENT_LIFECYCLE_LOG_MARKER = LIFECYCLE_BANNER;

const failureKind = z.enum(["uncaughtException", "unhandledRejection"]);

export type KnorviaProcessDiagnostic = {
  version: 1;
  errorId: string;
  kind: "uncaughtException" | "unhandledRejection";
  origin: "uncaughtException" | "unhandledRejection";
  name: string;
  message: string;
  stack?: string;
  occurredAt: number;
};

export const knorviaProcessDiagnosticSchema = strictShape([
  ["version", z.literal(1)],
  ["errorId", z.uuid()],
  ["kind", failureKind],
  ["origin", failureKind],
  ["name", z.string().min(1).max(LIMITS.name)],
  ["message", z.string().max(LIMITS.message)],
  ["stack", z.string().max(LIMITS.stack).optional()],
  ["occurredAt", z.number().int().nonnegative()],
]) as unknown as z.ZodType<KnorviaProcessDiagnostic>;

function readDiagnosticPayload(line: string): unknown {
  if (!line.startsWith(EXCEPTION_BANNER)) return undefined;
  if (line.length > LIMITS.line) return undefined;
  try {
    return JSON.parse(line.slice(EXCEPTION_BANNER.length)) as unknown;
  } catch {
    return undefined;
  }
}

export function parseKnorviaProcessDiagnostic(line: string): KnorviaProcessDiagnostic | undefined {
  const payload = readDiagnosticPayload(line);
  if (payload === undefined) return undefined;
  const parsed = knorviaProcessDiagnosticSchema.safeParse(payload);
  return parsed.success ? parsed.data : undefined;
}
