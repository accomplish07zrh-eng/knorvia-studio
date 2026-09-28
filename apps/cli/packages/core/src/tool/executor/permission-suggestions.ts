// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  PermissionCapabilityGroup,
  type PermissionRuleValue,
  type PermissionUpdate,
} from "@knorvia/contracts";
import { OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME } from "@knorvia/shared";

const CONTENT_FIELDS = ["command", "url", "file_path", "path", "pattern"] as const;

function* contentCandidates(input: unknown): Generator<unknown> {
  if (typeof input === "string") {
    yield input;
  } else if (input !== null && typeof input === "object") {
    const fields = input as Record<string, unknown>;
    for (const key of CONTENT_FIELDS) yield fields[key];
  }
}

function suggestedRule(
  toolName: string,
  input: unknown,
  group: PermissionCapabilityGroup | undefined,
): PermissionRuleValue {
  if (group) {
    switch (group) {
      case PermissionCapabilityGroup.OfficialCua:
        return { toolName: OFFICIAL_CUA_PERMISSION_RULE_TOOL_NAME };
      default:
        throw new Error(`Unsupported permission capability group: ${group}`);
    }
  }
  for (const value of contentCandidates(input)) {
    if (typeof value === "string" && value.trim()) return { toolName, ruleContent: value };
  }
  return { toolName };
}

export function buildDefaultPermissionUpdates(
  toolName: string,
  input: unknown,
  capabilityGroup?: PermissionCapabilityGroup,
): PermissionUpdate[] {
  return [
    {
      behavior: "allow",
      rules: [suggestedRule(toolName, input, capabilityGroup)],
      type: "addRules",
    },
  ];
}
