// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  AMEND_WORKFLOW_TOOL_NAME,
  CREATE_WORKFLOW_TOOL_NAME,
  CoreErrorType,
  createCoreError,
  type PermissionBrokerPort,
} from "@knorvia/contracts";
import {
  activatePermissionRequest,
  createDenyPermissionBroker,
  PermissionPreparation,
} from "@knorvia/core";

/** CLI workflow confirmation is a per-call exception, never a saved permission grant. */
export function createHeadlessPermissionBroker(): PermissionBrokerPort {
  const deny = createDenyPermissionBroker();
  const broker: PermissionBrokerPort = {
    async preparePermission(request, options) {
      if (![CREATE_WORKFLOW_TOOL_NAME, AMEND_WORKFLOW_TOOL_NAME].includes(request.toolName))
        return deny.preparePermission(request, options);
      return new PermissionPreparation({
        signal: options?.signal,
        cancelled: () =>
          createCoreError(CoreErrorType.ToolCancelled, "Permission request cancelled", {
            context: {
              requestId: request.requestId,
              toolCallId: request.toolCallId,
              toolName: request.toolName,
            },
            recoverable: true,
          }),
        activate: (owner) =>
          owner.resolve({
            decision: "allow",
            reason: `Headless CLI auto-approves ${request.toolName}: no interactive gate exists in -p mode.`,
            resolvedAt: new Date(),
          }),
      });
    },
    requestPermission(request, options) {
      return activatePermissionRequest(broker.preparePermission(request, options));
    },
  };
  return broker;
}
