// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type {
  NodeReplCuaAppIdentity,
  NodeReplImage,
  NodeReplRequestMeta,
  NodeReplRunResult,
  NodeReplStructuredResult,
} from "./session-contract.js";
import { stringifyValue } from "./runtime-values.js";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function imageFrom(value: unknown): NodeReplImage {
  let bytes: unknown = value;
  let mimeType = "image/png";
  if (record(value) && !ArrayBuffer.isView(value)) {
    if (typeof value.mimeType === "string" && value.mimeType) mimeType = value.mimeType;
    if (typeof value.base64 === "string" && value.base64) return { base64: value.base64, mimeType };
    if (typeof value.dataUrl === "string") {
      const matched = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value.dataUrl);
      if (matched) return { mimeType: matched[1]!, base64: matched[2]! };
    }
    bytes = value.bytes;
  }
  if (Array.isArray(bytes) && bytes.every((entry) => typeof entry === "number")) {
    return { base64: Buffer.from(bytes).toString("base64"), mimeType };
  }
  if (
    ArrayBuffer.isView(bytes) &&
    Object.prototype.toString.call(bytes) === "[object Uint8Array]"
  ) {
    return {
      base64: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64"),
      mimeType,
    };
  }
  throw new TypeError(
    "nodeRepl.emitImage requires bytes, dataUrl, { base64 }, or { bytes }; e.g. emitImage(await tab.screenshot())",
  );
}

function snapshot<T>(value: T, api: string): T {
  try {
    return structuredClone(value);
  } catch (cause) {
    throw new TypeError(`${api} requires structured-cloneable data`, { cause });
  }
}

/** A single run owns its output; closing it never transfers ownership to the next run. */
export class RunOutput {
  open = true;
  private readonly lines: string[] = [];
  private readonly pictures: NodeReplImage[] = [];
  private readonly screenshots: NodeReplImage[] = [];
  private readonly structured: NodeReplStructuredResult[] = [];
  private meta: Record<string, unknown> = {};
  private app?: NodeReplCuaAppIdentity;

  constructor(readonly requestMeta: NodeReplRequestMeta) {}
  write(...values: unknown[]): void {
    if (this.open)
      this.lines.push(values.map((value) => stringifyValue(value) ?? "undefined").join(" "));
  }
  emitImage(value: unknown): void {
    if (this.open) this.pictures.push(imageFrom(value));
  }
  emitStructuredResult(value: unknown): void {
    if (!this.open) return;
    if (!record(value) || !Array.isArray(value.content))
      throw new TypeError("nodeRepl.emitStructuredResult requires a content array");
    if (!value.content.every((block) => record(block) && typeof block.type === "string")) {
      throw new TypeError("nodeRepl.emitStructuredResult content blocks require a type");
    }
    this.structured.push(
      snapshot(
        {
          content: value.content,
          ...(typeof value.isError === "boolean" ? { isError: value.isError } : {}),
          ...(record(value.structuredContent)
            ? { structuredContent: value.structuredContent }
            : {}),
          ...(record(value._meta) ? { _meta: value._meta } : {}),
        },
        "nodeRepl.emitStructuredResult",
      ),
    );
  }
  setMeta(value: unknown, host = false): void {
    if (!this.open) return;
    if (!record(value)) throw new TypeError("nodeRepl.setResponseMeta requires a plain object");
    const copy = snapshot(value, "nodeRepl.setResponseMeta");
    const before = this.meta["knorvia/toolSurface"];
    const incoming = copy["knorvia/toolSurface"];
    // 采用数据属性展开，避免 __proto__ 元数据通过 Object.assign 的 setter 改变原型。
    this.meta = { ...this.meta, ...copy };
    if (host && record(before) && record(incoming))
      this.meta["knorvia/toolSurface"] = { ...before, ...incoming };
  }
  recordScreenshot(image: NodeReplImage): void {
    if (this.open) this.screenshots.push({ ...image });
  }
  recordApp(app: NodeReplCuaAppIdentity): void {
    if (this.open) this.app = { ...app };
  }
  finish(value?: unknown, error?: NodeReplRunResult["error"]): NodeReplRunResult {
    const result = error ? undefined : stringifyValue(value);
    this.open = false;
    const counts = new Map<string, number>();
    const key = (image: NodeReplImage) => `${image.mimeType}\0${image.base64}`;
    for (const image of this.screenshots) counts.set(key(image), (counts.get(key(image)) ?? 0) + 1);
    const indices: number[] = [];
    this.pictures.forEach((image, index) => {
      const count = counts.get(key(image)) ?? 0;
      if (count) {
        indices.push(index);
        counts.set(key(image), count - 1);
      }
    });
    return {
      logs: this.lines.join("\n"),
      ...(result !== undefined ? { result } : {}),
      ...(error ? { error } : {}),
      ...(this.pictures.length ? { images: this.pictures } : {}),
      ...(indices.length ? { browserScreenshotImageIndices: indices } : {}),
      ...(this.structured.length ? { structuredResults: this.structured } : {}),
      ...(Object.keys(this.meta).length ? { responseMeta: this.meta } : {}),
      ...(this.app ? { cuaApp: this.app } : {}),
    };
  }
}
