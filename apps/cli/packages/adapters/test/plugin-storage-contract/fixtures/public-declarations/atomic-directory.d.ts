// SPDX-License-Identifier: Apache-2.0
// Retained generated public declaration snapshot; not a new Knorvia implementation.
// Source and original digest: licensing/evidence/plugin-storage-runtime.md

interface ActivateDirectoryAtomicallyInput {
  authorityPath?: string;
  prepare?: (stagedPath: string) => Promise<void>;
  signal?: AbortSignal;
  sourcePath?: string;
  targetPath: string;
}
export interface AtomicDirectoryActivation {
  finalize: () => Promise<void>;
  rollback: () => Promise<void>;
  transactionId: string;
}
export declare function recoverAtomicTargetSync(targetPath: string): string;
export declare function activateDirectoryAtomically(
  input: ActivateDirectoryAtomicallyInput,
): Promise<AtomicDirectoryActivation>;
export declare function writeFileAtomically(path: string, data: string | Uint8Array): Promise<void>;
export {};
//# sourceMappingURL=atomic-directory.d.ts.map
