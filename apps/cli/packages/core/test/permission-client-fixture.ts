// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { PermissionBrokerPort } from "@knorvia/contracts";
import { PermissionPreparation } from "../src/permission/prepared-request.js";

/** Explicit two-phase test adapter; individual cases may replace the answer callback. */
export function fixturePermissionBroker(
  requestPermission: PermissionBrokerPort["requestPermission"],
): PermissionBrokerPort {
  return {
    requestPermission,
    async preparePermission(request, options) {
      return new PermissionPreparation({
        signal: options?.signal,
        cancelled: () => new Error("Fixture permission cancelled"),
        activate: async (owner) => owner.resolve(await this.requestPermission(request, options)),
      });
    },
  };
}
