// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { DatabaseSync } from "node:sqlite";
import type {
  CollaborationMode,
  PermissionRuleset,
  ProjectId,
  ProjectPermissionUpdateInput,
} from "@knorvia/contracts";
import { isCollaborationMode } from "../codecs.js";
import { decodeJson } from "../json.js";
import {
  readPermissionCell,
  readProjectRules,
  writePermissionCell,
} from "./project-permission-cell.js";
import { commitProjectPermissionUpdate } from "./project-permission-transaction.js";

export async function getProjectPermission(
  db: DatabaseSync,
  projectID: ProjectId,
): Promise<PermissionRuleset | null> {
  return readProjectRules(db, projectID);
}

export async function saveProjectPermission(
  db: DatabaseSync,
  input: { projectID: ProjectId; permission: PermissionRuleset },
): Promise<PermissionRuleset> {
  const timestamp = Date.now();
  writePermissionCell(db, input.projectID, "ruleset", JSON.stringify(input.permission), timestamp);
  const saved = await getProjectPermission(db, input.projectID);
  if (!saved) throw new Error(`Project permission not found after write: ${input.projectID}`);
  return saved;
}

export function getProjectPermissionMode(
  db: DatabaseSync,
  projectID: ProjectId,
): CollaborationMode | null {
  const cell = readPermissionCell(db, projectID, "mode");
  if (!cell) return null;
  const decoded = decodeJson<{ mode?: unknown }>(cell.value);
  return isCollaborationMode(decoded?.mode) ? decoded.mode : null;
}

export function saveProjectPermissionMode(
  db: DatabaseSync,
  input: { mode: CollaborationMode; projectID: ProjectId },
): CollaborationMode {
  const timestamp = Date.now();
  writePermissionCell(db, input.projectID, "mode", JSON.stringify({ mode: input.mode }), timestamp);
  return input.mode;
}

export async function updateProjectPermission(
  db: DatabaseSync,
  input: ProjectPermissionUpdateInput,
): Promise<PermissionRuleset> {
  return commitProjectPermissionUpdate(db, input);
}
