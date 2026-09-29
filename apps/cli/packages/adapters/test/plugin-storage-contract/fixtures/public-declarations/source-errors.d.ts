// SPDX-License-Identifier: Apache-2.0
// Retained generated public declaration snapshot; not a new Knorvia implementation.
// Source and original digest: licensing/evidence/plugin-storage-runtime.md

import type { PluginDiagnosticCode } from "@knorvia/contracts";
export declare function createGitUnavailableError(source: string, reason?: string): Error;
export declare function createArchiveFetchError(source: string, cause: unknown): Error;
export declare function getPluginSourceDiagnosticCode(
  error: unknown,
): PluginDiagnosticCode | undefined;
export declare function isCommandUnavailableError(error: unknown): boolean;
//# sourceMappingURL=source-errors.d.ts.map
