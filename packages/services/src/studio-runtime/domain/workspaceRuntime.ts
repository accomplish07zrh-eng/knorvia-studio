// SPDX-License-Identifier: Apache-2.0
import type {
  StudioWorkspaceRuntimeCommand,
  StudioWorkspaceRuntimeControl,
  StudioWorkspaceRuntimeError,
} from "../workspaceRuntimeTypes.js";

export class WorkspaceRuntimeFault extends Error {
  constructor(readonly code: StudioWorkspaceRuntimeError) {
    super(`Workspace runtime: ${code}`);
  }
}
export function validateWorkspaceRuntimeControl(control: StudioWorkspaceRuntimeControl): void {
  if (!control || !["prepare", "start", "stop", "recover"].includes(control.action))
    throw new WorkspaceRuntimeFault("invalid-command");
  if (control.action === "stop" || control.action === "recover") return;
  if (control.approved !== true) throw new WorkspaceRuntimeFault("approval-required");
  const command = control.command;
  if (control.action === "start" || command) {
    if (
      !command ||
      typeof command.executable !== "string" ||
      !command.executable.trim() ||
      command.executable.length > 4096 ||
      command.executable.includes("\0") ||
      !Array.isArray(command.args) ||
      command.args.length > 128 ||
      command.args.some(
        (arg) => typeof arg !== "string" || arg.includes("\0") || arg.length > 16_384,
      )
    )
      throw new WorkspaceRuntimeFault("invalid-command");
  }
  if (
    control.action === "start" &&
    ((control.healthPath !== undefined &&
      (typeof control.healthPath !== "string" ||
        !/^\/(?!\/)[^\s?#]*$/.test(control.healthPath) ||
        control.healthPath.length > 2048)) ||
      (control.timeoutMs !== undefined &&
        (!Number.isInteger(control.timeoutMs) ||
          control.timeoutMs < 100 ||
          control.timeoutMs > 120_000)))
  )
    throw new WorkspaceRuntimeFault("invalid-command");
}
/** Copy on admission; caller mutation cannot change a command awaiting IO. */
export function workspaceRuntimeCommand(
  command: StudioWorkspaceRuntimeCommand,
  port?: number,
): StudioWorkspaceRuntimeCommand {
  return {
    executable: command.executable,
    args: command.args.map((arg) =>
      arg
        .replaceAll("{host}", "127.0.0.1")
        .replaceAll("{port}", port === undefined ? "" : String(port)),
    ),
  };
}
