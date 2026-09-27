// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";
import { browserViewportInputSchema, type BrowserCommandMethod } from "./command-metadata.js";
import {
  browserMouseButtonSchema,
  browserPointSchema,
  modifiers,
  optionalCoordinates,
  tabTarget,
} from "./input-fields.js";
import { browserPlaywrightActionSchema } from "./playwright-actions.js";
import { browserRecordingOptionsSchema, recordingOutputPath } from "./recording-actions.js";
import { directory, field, strict } from "./wire-schema.js";

export {
  browserClientModeSchema,
  browserCommandContextSchema,
  browserCommandMethodSchema,
  browserErrorCodeSchema,
  browserPageStateSchema,
} from "./command-metadata.js";
export type {
  BrowserClientMode,
  BrowserCommandContext,
  BrowserCommandMethod,
  BrowserErrorCode,
  BrowserPageState,
} from "./command-metadata.js";
export {
  browserMouseButtonSchema,
  browserKeyModifierSchema,
  browserPointSchema,
} from "./input-fields.js";
export type { BrowserMouseButton, BrowserKeyModifier, BrowserPoint } from "./input-fields.js";
export * from "./playwright-actions.js";
export {
  browserRecordingActionSchema,
  browserRecordingOptionsSchema,
} from "./recording-actions.js";
export type { BrowserRecordingAction, BrowserRecordingOptions } from "./recording-actions.js";

const elementTarget = { ref: field.nonempty.optional(), ...optionalCoordinates };
const explicitTab = { tabId: field.nonempty };
const withModifiers = { modifiers, ...tabTarget };
const commandFields = {
  navigate: { url: field.nonempty, ...tabTarget },
  back: tabTarget,
  forward: tabTarget,
  reload: tabTarget,
  snapshot: {
    maxElements: field.positiveInt.optional(),
    includeHidden: field.flag.optional(),
    ...tabTarget,
  },
  click: {
    ...elementTarget,
    button: browserMouseButtonSchema.optional(),
    doubleClick: field.flag.optional(),
    ...withModifiers,
  },
  fill: { ref: field.nonempty, value: field.text, ...tabTarget },
  type: { ref: field.nonempty.optional(), text: field.text, ...tabTarget },
  press: { key: field.nonempty, ref: field.nonempty.optional(), ...withModifiers },
  cuaKeypress: { keys: z.array(field.nonempty).min(1), ...tabTarget },
  scroll: { ...elementTarget, ...tabTarget },
  cuaScroll: {
    ...browserPointSchema.shape,
    scrollX: field.number,
    scrollY: field.number,
    ...withModifiers,
  },
  domCuaScroll: {
    nodeId: field.nonempty.optional(),
    scrollX: field.number,
    scrollY: field.number,
    ...tabTarget,
  },
  screenshot: {
    ref: field.nonempty.optional(),
    fullPage: field.flag.optional(),
    clip: strict({
      ...browserPointSchema.shape,
      width: field.positive,
      height: field.positive,
    }).optional(),
    ...tabTarget,
  },
  getState: tabTarget,
  hover: { ...elementTarget, ...withModifiers },
  select: { ref: field.nonempty, values: z.array(field.text).min(1), ...tabTarget },
  check: { ref: field.nonempty, checked: field.flag.optional(), ...tabTarget },
  drag: {
    fromRef: field.nonempty.optional(),
    toRef: field.nonempty.optional(),
    from: browserPointSchema.optional(),
    to: browserPointSchema.optional(),
    ...withModifiers,
  },
  cuaDrag: { path: z.array(browserPointSchema).min(1), ...withModifiers },
  elementInfo: { ...browserPointSchema.shape, ...tabTarget },
  evaluate: { expression: field.nonempty, ...tabTarget },
  getDialog: tabTarget,
  handleDialog: { accept: field.flag, promptText: field.text.optional(), ...tabTarget },
  waitFor: {
    selector: field.nonempty.optional(),
    text: field.nonempty.optional(),
    textGone: field.nonempty.optional(),
    timeoutMs: field.positiveInt.optional(),
    ...tabTarget,
  },
  playwrightWaitForTimeout: { timeoutMs: field.count, ...tabTarget },
  playwright: { action: browserPlaywrightActionSchema, ...tabTarget },
  capabilities: tabTarget,
  browserVisibilityGet: {},
  browserVisibilitySet: { visible: field.flag },
  browserViewportSet: { ...browserViewportInputSchema.shape, ...tabTarget },
  browserViewportReset: tabTarget,
  recordingStart: { options: browserRecordingOptionsSchema.optional(), ...tabTarget },
  recordingStatus: {
    recordingId: field.identity,
    outputPath: recordingOutputPath.optional(),
    ...tabTarget,
  },
  recordingCancel: { recordingId: field.identity, ...tabTarget },
  activateTab: explicitTab,
  newTab: {},
  listUserTabs: {},
  claimTab: explicitTab,
  finalizeTabs: {
    keep: z.array(strict({ ...explicitTab, status: z.enum(["handoff", "deliverable"]) })),
  },
  markDeliverable: explicitTab,
  markHandoff: explicitTab,
  nameSession: { name: field.identity },
  finalize: { ...tabTarget, deliverable: field.flag.optional() },
  turnEnded: { turnId: field.nonempty.optional() },
  closeSession: {},
  cancelRequest: { requestId: field.nonempty },
  close: tabTarget,
  list: {},
} satisfies Record<BrowserCommandMethod, z.ZodRawShape>;

export const browserCommandSchema = directory("method", commandFields, {
  browserViewportSet: ["width", "height"],
});
export type BrowserCommand = z.infer<typeof browserCommandSchema>;
