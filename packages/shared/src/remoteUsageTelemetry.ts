// SPDX-License-Identifier: Apache-2.0
export type {
  RemoteUsageErrorCategory,
  RemoteUsageRemoteKind,
  RemoteUsageResult,
  RemoteUsageWorkspaceKind,
  RemoteWorkspaceConnectTrigger,
} from "./internal-s04/remote-usage-telemetry.js";

export {
  buildRemoteWorkspaceConnectResultTelemetry,
  classifyRemoteUsageError,
  resolveWorkspaceTelemetryDetail,
} from "./internal-s04/remote-usage-telemetry.js";
