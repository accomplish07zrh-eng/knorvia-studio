// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionOptionsPolicy, ToolResultDisplayPayload } from "@knorvia/contracts";
import type { ToolApprovalGate } from "../../types.js";

const OPTION_POLICIES = new Map<false | "session" | undefined, PermissionOptionsPolicy>([
  [false, "no-always-allow"],
  ["session", "session-always-allow"],
]);

export interface ResolvedToolApproval {
  gate: "ask" | "proceed";
  display?: ToolResultDisplayPayload;
  optionsPolicy?: PermissionOptionsPolicy;
}

/** Immutable request options feed one record writer on normal and failed previews. */
export class AskProjection {
  private readonly options: PermissionOptionsPolicy | undefined;
  constructor(allowAlways: false | "session" | undefined) {
    this.options = OPTION_POLICIES.get(allowAlways);
  }

  project(preview: ToolApprovalGate): ResolvedToolApproval {
    return preview.gate === "proceed" ? { gate: "proceed" } : this.ask(preview);
  }

  ask(preview?: { display?: ToolResultDisplayPayload }): ResolvedToolApproval {
    const result: ResolvedToolApproval = { gate: "ask" };
    if (preview?.display) result.display = preview.display;
    if (this.options) result.optionsPolicy = this.options;
    return result;
  }
}
