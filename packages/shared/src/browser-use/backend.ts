// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";
import { browserClientModeSchema } from "./command-metadata.js";
import { field, strict } from "./wire-schema.js";

export const browserBackendTypeSchema = z.enum(["iab", "extension", "cdp"]);
export const browserSessionContextKindSchema = z.enum(["live", "cached"]);
export const browserCapabilityDescriptorSchema = strict({
  id: field.identity,
  description: field.identity,
});
const capabilityList = z.array(browserCapabilityDescriptorSchema).optional();
export const browserBackendDescriptorSchema = strict({
  id: field.identity,
  generation: field.count.default(0),
  type: browserBackendTypeSchema,
  name: field.identity,
  capabilities: strict({ browser: capabilityList, tab: capabilityList }),
  apiSupportOverrides: z.record(field.text, field.flag).optional(),
  metadata: field.textMap.optional(),
});

// The host supplies isolation identity. File paths alone are not authorization.
export const browserDiscoveryContextSchema = strict({
  requestId: field.identity,
  workspaceKey: field.identity,
  workspacePath: field.identity,
  workspaceIdentity: field.identity.optional(),
  remoteSessionId: field.identity.optional(),
  sessionId: field.identity,
  turnId: field.identity.optional(),
  clientMode: browserClientModeSchema,
  sessionContext: browserSessionContextKindSchema,
});
export const browserSessionContextSchema = strict({
  ...browserDiscoveryContextSchema.shape,
  browserId: field.identity,
  browserGeneration: field.count,
});
export const browserBackendListResultSchema = strict({
  browsers: z.array(browserBackendDescriptorSchema),
});
export type BrowserBackendType = z.infer<typeof browserBackendTypeSchema>;
export type BrowserSessionContextKind = z.infer<typeof browserSessionContextKindSchema>;
export type BrowserCapabilityDescriptor = z.infer<typeof browserCapabilityDescriptorSchema>;
export type BrowserBackendDescriptor = z.infer<typeof browserBackendDescriptorSchema>;
export type BrowserDiscoveryContext = z.infer<typeof browserDiscoveryContextSchema>;
export type BrowserSessionContext = z.infer<typeof browserSessionContextSchema>;
export type BrowserBackendListResult = z.infer<typeof browserBackendListResultSchema>;
