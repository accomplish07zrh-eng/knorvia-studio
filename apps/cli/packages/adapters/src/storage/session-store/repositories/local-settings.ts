// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 项目级设置的读写：权限规则集与协作模式各自存在 permission 表的单元里。
// 单元名（"ruleset"/"mode"）、JSON 形状与错误文案都属于可观察契约，逐字保留。

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

const RULESET_CELL = "ruleset";
const MODE_CELL = "mode";

interface ProjectRef {
  projectID: ProjectId;
}

/** 规则集写入：时间戳由调用时决定，写入后立即回读以确认落库。 */
function persistRuleset(
  database: DatabaseSync,
  projectID: ProjectId,
  permission: PermissionRuleset,
  at: number,
): void {
  const payload = JSON.stringify(permission);
  writePermissionCell(database, projectID, RULESET_CELL, payload, at);
}

export async function getProjectPermission(
  database: DatabaseSync,
  projectID: ProjectId,
): Promise<PermissionRuleset | null> {
  return readProjectRules(database, projectID);
}

export async function saveProjectPermission(
  database: DatabaseSync,
  request: ProjectRef & { permission: PermissionRuleset },
): Promise<PermissionRuleset> {
  persistRuleset(database, request.projectID, request.permission, Date.now());
  const stored = await getProjectPermission(database, request.projectID);
  if (!stored) throw new Error(`Project permission not found after write: ${request.projectID}`);
  return stored;
}

/** 模式单元：非法的历史值一律按「未设置」返回 null，不抛错。 */
function readModeValue(database: DatabaseSync, projectID: ProjectId): unknown {
  const entry = readPermissionCell(database, projectID, MODE_CELL);
  if (!entry) return undefined;
  return decodeJson<{ mode?: unknown }>(entry.value)?.mode;
}

export function getProjectPermissionMode(
  database: DatabaseSync,
  projectID: ProjectId,
): CollaborationMode | null {
  const mode = readModeValue(database, projectID);
  return isCollaborationMode(mode) ? mode : null;
}

function persistMode(
  database: DatabaseSync,
  projectID: ProjectId,
  mode: CollaborationMode,
  at: number,
): void {
  writePermissionCell(database, projectID, MODE_CELL, JSON.stringify({ mode }), at);
}

export function saveProjectPermissionMode(
  database: DatabaseSync,
  request: ProjectRef & { mode: CollaborationMode },
): CollaborationMode {
  persistMode(database, request.projectID, request.mode, Date.now());
  return request.mode;
}

export async function updateProjectPermission(
  database: DatabaseSync,
  request: ProjectPermissionUpdateInput,
): Promise<PermissionRuleset> {
  return commitProjectPermissionUpdate(database, request);
}
