// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type * as API from "../src/storage/workspace-hook-trust-store.js";
export {
  createFileWorkspaceHookTrustStore,
  createDefaultFileWorkspaceHookTrustStore,
  resolveWorkspaceHookTrustStorePath,
  FileWorkspaceHookTrustStore,
} from "../src/storage/workspace-hook-trust-store.js";
export type Store = InstanceType<typeof API.FileWorkspaceHookTrustStore>;
export type StoreOptions = API.FileWorkspaceHookTrustStoreOptions;
export type StoreFile = Awaited<ReturnType<Store["grant"]>>;
export type TrustRecord = StoreFile["records"][number];
