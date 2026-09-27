// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";
import { field, strict } from "./wire-schema.js";

const pageText = { url: field.text, title: field.text };
const accessibleText = {
  role: field.text.optional(),
  name: field.text.optional(),
  text: field.text.optional(),
};
export const browserElementRectSchema = strict({
  x: field.number,
  y: field.number,
  width: field.number,
  height: field.number,
});
export const browserSnapshotElementSchema = strict({
  ref: field.nonempty,
  tag: field.text,
  ...accessibleText,
  value: field.text.optional(),
  disabled: field.flag.optional(),
  checked: field.flag.optional(),
  selector: field.text,
  xpath: field.text,
  rect: browserElementRectSchema,
  inViewport: field.flag,
  parentRef: field.text.optional(),
  framePath: field.text.optional(),
  attributes: field.textMap.optional(),
});
export const browserSnapshotDomNodeSchema = strict({
  tag: field.text,
  depth: field.count,
  inViewport: field.flag,
  ref: field.nonempty.optional(),
  ...accessibleText,
  attributes: field.textMap.optional(),
});
export const browserSnapshotSchema = strict({
  ...pageText,
  // 文本截断按序保留：先输出页面语义，再输出定位细节，避免回归为只有句柄可见。
  dom: z.array(browserSnapshotDomNodeSchema).optional(),
  domTruncated: field.flag.optional(),
  elements: z.array(browserSnapshotElementSchema),
  truncated: field.flag,
});
export type BrowserElementRect = z.infer<typeof browserElementRectSchema>;
export type BrowserSnapshotElement = z.infer<typeof browserSnapshotElementSchema>;
export type BrowserSnapshotDomNode = z.infer<typeof browserSnapshotDomNodeSchema>;
export type BrowserSnapshot = z.infer<typeof browserSnapshotSchema>;
