// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionBrokerPort } from "@knorvia/contracts";
import { activatePermissionRequest, PermissionPreparation } from "@knorvia/core";
import type { TuiRequestPermission } from "@knorvia/tui";

/** Bind the handler at preparation, so later turns cannot steal an existing answer route. */
export function createTuiPermissionBroker(
  readHandler: () => TuiRequestPermission | undefined,
): PermissionBrokerPort {
  const broker: PermissionBrokerPort = {
    async preparePermission(request, options) {
      const handler = readHandler();
      if (handler) return handler.preparePermission(request, options);
      return new PermissionPreparation({
        signal: options?.signal,
        cancelled: () => new Error("Permission request cancelled"),
        activate: (owner) =>
          owner.resolve({
            decision: "deny",
            reason: `No interactive approval handler configured for ${request.toolName}`,
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
