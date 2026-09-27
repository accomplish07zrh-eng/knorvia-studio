// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";
import { field, strict } from "./wire-schema.js";

export const browserMouseButtonSchema = z.enum(["left", "right", "middle"]);
export const browserKeyModifierSchema = z.enum([
  "Alt",
  "Control",
  "ControlOrMeta",
  "Meta",
  "Shift",
]);
export const browserPointSchema = strict({ x: field.number, y: field.number });
export type BrowserMouseButton = z.infer<typeof browserMouseButtonSchema>;
export type BrowserKeyModifier = z.infer<typeof browserKeyModifierSchema>;
export type BrowserPoint = z.infer<typeof browserPointSchema>;

export const elementState = z.enum(["attached", "detached", "visible", "hidden"]);
export const modifiers = z.array(browserKeyModifierSchema).optional();
export const tabTarget = { tabId: field.text.optional() };
export const optionalCoordinates = { x: field.number.optional(), y: field.number.optional() };
