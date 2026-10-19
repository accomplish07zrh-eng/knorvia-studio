// SPDX-License-Identifier: Apache-2.0

import type { ImportedWorldQueue } from "./imported-cache.js";
import type { ArtifactOp } from "../facade/registry.js";
import type {
  ImportedRunCache,
  JournalStorePort,
  RunEvent,
  RunStopReason,
  WorkflowDriver,
  WorkflowError,
} from "./types.js";

export type RunSettlement =
  | { status: "completed"; artifact: unknown }
  | { status: "errored"; error: WorkflowError }
  | { status: "stopped"; reason: RunStopReason; supersededBy?: string; error?: WorkflowError };

export interface ArtifactIdState {
  kind: ArtifactOp;
  versions: number;
  spec?: string;
  primary?: true;
}

export interface EngineState {
  readonly runId: string;
  readonly driver: WorkflowDriver;
  readonly journal: JournalStorePort;
  readonly artifacts: Map<string, ArtifactIdState>;
  readonly importedCache: ImportedRunCache | undefined;
  readonly importedWorld: ImportedWorldQueue;

  isRunSettled(): boolean;
  runError(): WorkflowError;
  failRun(error: WorkflowError): void;
  record(event: RunEvent): void;
  nextOrdinal(siteId: string): number;

  reportCount(): number;
  countReport(): void;

  importClosed(): boolean;
  closeImport(): void;

  markSettled(failure?: WorkflowError): void;
  abortInFlight(error: WorkflowError, emitCancelled: boolean): void;
  resolveSettled(settlement: RunSettlement): void;
}
