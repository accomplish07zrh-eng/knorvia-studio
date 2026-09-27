// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";
import { directory, field, strict } from "./wire-schema.js";
import {
  browserKeyModifierSchema,
  browserMouseButtonSchema,
  browserPointSchema,
  elementState,
} from "./input-fields.js";

export const browserPlaywrightModifierSchema = browserKeyModifierSchema;
export const browserPlaywrightLocatorOperationSchema = z.enum([
  "allTextContents",
  "click",
  "count",
  "dblclick",
  "downloadMedia",
  "evaluate",
  "fill",
  "getAttribute",
  "innerText",
  "isEnabled",
  "isVisible",
  "press",
  "selectOption",
  "setChecked",
  "textContent",
  "waitFor",
]);
const timeout = { timeoutMs: field.positiveInt.optional() };
const expressionKind = z.enum(["string", "function"]);
const loadStates = ["load", "domcontentloaded", "networkidle"] as const;
const hitTest = { ...browserPointSchema.shape, includeNonInteractable: field.flag.optional() };
const selection = strict({
  value: field.text.optional(),
  label: field.text.optional(),
  index: field.count.optional(),
}).refine(
  (value) => Object.values(value).some((entry) => entry !== undefined),
  "Select option requires value, label, or index",
);

export const browserPlaywrightActionSchema = directory("name", {
  domSnapshot: {},
  elementInfo: hitTest,
  elementScreenshot: hitTest,
  evaluate: {
    expression: field.nonempty,
    expressionKind,
    arg: field.opaque.optional(),
    ...timeout,
  },
  waitForLoadState: { state: z.enum(loadStates).optional(), ...timeout },
  waitForURL: {
    url: field.nonempty,
    waitUntil: z.enum([...loadStates, "commit"]).optional(),
    ...timeout,
  },
  waitForEvent: { event: z.enum(["download", "filechooser"]), ...timeout },
  downloadPath: { downloadId: field.nonempty, ...timeout },
  fileChooserSetFiles: {
    fileChooserId: field.nonempty,
    files: z.array(field.text).min(1),
    ...timeout,
  },
  locator: {
    selector: field.nonempty,
    operation: browserPlaywrightLocatorOperationSchema,
    value: field.opaque.optional(),
    arg: field.opaque.optional(),
    expression: field.nonempty.optional(),
    expressionKind: expressionKind.optional(),
    attribute: field.nonempty.optional(),
    checked: field.flag.optional(),
    replace: field.flag.optional(),
    force: field.flag.optional(),
    button: browserMouseButtonSchema.optional(),
    modifiers: z.array(browserPlaywrightModifierSchema).optional(),
    state: elementState.optional(),
    selections: z.array(selection).min(1).optional(),
    ...timeout,
  },
});
export type BrowserPlaywrightModifier = z.infer<typeof browserPlaywrightModifierSchema>;
export type BrowserPlaywrightLocatorOperation = z.infer<
  typeof browserPlaywrightLocatorOperationSchema
>;
export type BrowserPlaywrightAction = z.infer<typeof browserPlaywrightActionSchema>;
