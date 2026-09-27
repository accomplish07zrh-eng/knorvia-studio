// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Frame } from "./frames.js";
import { attribution, contextDetail } from "./context.js";
import { text } from "./text.js";

export const FALLBACK = "Turn execution failed";

export function select(frames: readonly Frame[]) {
  let firstMessage: Frame | undefined;
  let primary: Frame | undefined;
  let underlying: Frame | undefined;
  let ordinaryCode: string | undefined;
  let contextCode: string | undefined;
  let anyCode: string | undefined;
  for (const frame of frames) {
    if (frame.message) {
      firstMessage ??= frame;
      if (!frame.wrapper) primary ??= frame;
    }
    if (!frame.wrapper) {
      underlying = frame;
      ordinaryCode ??= frame.code;
    }
    contextCode ??= frame.contextCode;
    anyCode ??= frame.code;
  }
  primary ??= firstMessage;
  underlying ??= frames.at(-1);
  const preferredCode = primary?.wrapper
    ? (primary.contextCode ?? primary.code)
    : (primary?.code ?? primary?.contextCode);
  return { primary, underlying, code: preferredCode ?? ordinaryCode ?? contextCode ?? anyCode };
}

export function project(frames: readonly Frame[], fallback: string) {
  const selection = select(frames);
  const message = selection.primary?.message ?? text(fallback, "summary") ?? fallback;
  const lines = new Set<string>();
  for (const frame of frames)
    for (const line of [frame.message, frame.detail, contextDetail(frame.data)])
      if (line) lines.add(line);
  lines.delete(message);
  const detail = [...lines].join("\n");
  const info = attribution(frames);
  return {
    ...(info ? { attribution: info } : {}),
    ...(selection.code ? { code: selection.code } : {}),
    message,
    ...(detail ? { detail } : {}),
    ...(selection.underlying?.message
      ? { underlyingErrorMessage: selection.underlying.message }
      : {}),
    ...(selection.underlying?.detail ? { underlyingErrorDetail: selection.underlying.detail } : {}),
  };
}
