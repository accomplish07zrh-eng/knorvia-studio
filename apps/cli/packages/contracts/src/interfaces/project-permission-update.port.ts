// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionRuleset } from "./permission.port.js";
import type { ProjectId } from "./shared.js";

export interface ProjectPermissionUpdateInput {
  projectID: ProjectId;
  /** Synchronous pure transformation: no I/O, reentry or Promise result. */
  update(current: PermissionRuleset | null): PermissionRuleset;
}

/** Optional capability for stores that can commit a ruleset transformation atomically. */
export interface ProjectPermissionUpdatePort {
  /**
   * Resolve with a detached committed snapshot. Reject without falling back to overwrite.
   * The store owns serialization with other atomic writers and must call update once.
   * A lock/admission failure may reject before invoking update.
   *
   * @example
   * await store.updateProjectPermission?.({
   *   projectID,
   *   update: current => ({ ...current, version: 1 }),
   * });
   */
  updateProjectPermission?(input: ProjectPermissionUpdateInput): Promise<PermissionRuleset>;
}
