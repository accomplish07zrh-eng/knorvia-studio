// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserBackendType } from "@knorvia/contracts/browser-control";

export type BrowserApiMemberKind = "method" | "property";

export interface BrowserApiRequirement {
  unsupportedByDefaultIn?: BrowserBackendType[];
  requiresCapabilities?: string[];
}

export interface BrowserApiDeclaration extends BrowserApiRequirement {
  signature: string;
  documented?: boolean;
}

export interface BrowserApiManifestMember extends BrowserApiDeclaration {
  name: string;
  kind: BrowserApiMemberKind;
  command?: string;
  declarations?: BrowserApiDeclaration[];
}

export interface BrowserApiManifestObject {
  members: BrowserApiManifestMember[];
}

export interface BrowserApiManifest {
  version: number;
  entrypoints?: string[];
  semantics?: Record<string, string>;
  types?: Record<string, string>;
  objects: Record<string, BrowserApiManifestObject>;
}
