// SPDX-License-Identifier: Apache-2.0
// Retained public compatibility declaration.

import { type KnorviaCredentialCipher } from "./credential-cipher.js";

export interface SharedKnorviaCredentialStoreOptions {
  baseDir?: string;
  cipher?: KnorviaCredentialCipher;
  env?: Record<string, string | undefined>;
  filePath?: string;
}

export interface SharedKnorviaCredentialStore {
  readonly filePath: string;
  delete(key: string): Promise<void>;
  deleteIfValue(key: string, expectedValue: string): Promise<boolean>;
  deleteIfValues(
    expectedValues: Readonly<Record<string, string>>,
  ): Promise<Record<string, boolean>>;
  deleteManyIfValue(
    guardKey: string,
    expectedGuardValue: string,
    keysToDelete: readonly string[],
  ): Promise<boolean>;
  load(key: string): Promise<string | null>;
  loadMany(keys: readonly string[]): Promise<Record<string, string | null>>;
  onDidChange?(listener: () => void | Promise<void>): () => void;
  save(key: string, value: string): Promise<void>;
  saveMany(entries: Readonly<Record<string, string>>): Promise<void>;
  saveReplacing(key: string, value: string, replacedKeys: readonly string[]): Promise<void>;
}

export declare function createSharedKnorviaCredentialStore(
  options?: SharedKnorviaCredentialStoreOptions,
): SharedKnorviaCredentialStore;

export declare function loadSharedKnorviaCredentialSync(
  key: string,
  options?: SharedKnorviaCredentialStoreOptions,
): string | undefined;

export declare function resolveSharedKnorviaCredentialsPath(
  options?: SharedKnorviaCredentialStoreOptions,
): string;
