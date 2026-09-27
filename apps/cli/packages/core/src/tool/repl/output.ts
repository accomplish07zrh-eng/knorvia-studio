// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { JsOutput, ModelMessageContent, ModelMessageContentBlock } from "@knorvia/contracts";
import type { NodeReplRunResult } from "../../repl/session-contract.js";

export function toolOutput(run: NodeReplRunResult, paths: string[]): JsOutput {
  const output: JsOutput =
    run.result === undefined ? { logs: run.logs } : { result: run.result, logs: run.logs };
  if (run.error) output.error = run.error;
  if (run.images?.length) output.images = run.images;
  if (paths.length) output.browserScreenshotPaths = paths;
  if (run.responseMeta) output.responseMeta = run.responseMeta;
  return output;
}

function* textSections(output: JsOutput): Generator<string> {
  if (output.error) {
    const header = `${output.error.name}: ${output.error.message}`;
    yield header;
    const stack = output.error.stack ?? "";
    // 多行 message 在 stack 头中是一整段；只去首行会重复 locator 的错误正文。
    const start = stack.startsWith(header + "\n") ? header.length + 1 : stack.indexOf("\n") + 1;
    const frames = start > 0 ? stack.slice(start).trimEnd() : "";
    if (frames.trim()) yield frames;
  }
  if (output.logs) yield output.logs;
  if (output.result !== undefined) yield `=> ${output.result}`;
  for (const path of output.browserScreenshotPaths ?? [])
    yield `Browser screenshot saved to: ${path}`;
}

export function formatJsModelContent(value: unknown): ModelMessageContent {
  const output = value as JsOutput;
  const sections = [...textSections(output)];
  const text = sections.length ? sections.join("\n") : "(no output)";
  if (!output.images?.length) return text;
  const content = output.images.map<ModelMessageContentBlock>((image) => ({
    type: "image",
    mediaType: image.mimeType,
    dataUrl: `data:${image.mimeType};base64,${image.base64}`,
  }));
  content.push({ type: "text", text });
  return content;
}
