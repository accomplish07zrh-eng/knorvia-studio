// SPDX-License-Identifier: Apache-2.0
export type {
  ParsedRemoteWorkspaceIdentity,
  RemoteWorkspaceIdentityKind,
} from "./internal-s04/remote-workspace-identity.js";

export {
  buildRemoteWorkspaceIdentity,
  isRemoteWorkspaceIdentity,
  parseRemoteWorkspaceIdentity,
} from "./internal-s04/remote-workspace-identity.js";
