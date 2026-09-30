// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type {
  ModelRequestAdmission,
  ModelRequestAdmissionTicket,
  ModelRequestTarget,
} from "@knorvia/contracts";
export interface AttemptAdmission {
  readonly ticket?: ModelRequestAdmissionTicket;
  release(): void;
}
function aborted(signal?: AbortSignal): never | void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}
export async function admitAttempt(input: {
  admission?: ModelRequestAdmission;
  model: ModelRequestTarget;
  signal?: AbortSignal;
  onQueued?: () => Promise<void>;
  onAdmitted?: (queuedMs: number) => Promise<void>;
}): Promise<AttemptAdmission> {
  aborted(input.signal);
  if (!input.admission) return { release() {} };
  let ticket = input.admission.tryAcquire?.({ model: input.model });
  if (!ticket) {
    const queuedAt = Date.now();
    if (input.admission.tryAcquire) await input.onQueued?.();
    ticket = await input.admission.acquire({ model: input.model, signal: input.signal });
    aborted(input.signal);
    if (input.admission.tryAcquire) await input.onAdmitted?.(Date.now() - queuedAt);
  }
  let released = false;
  return {
    ticket,
    release() {
      if (released) return;
      released = true;
      ticket?.release();
    },
  };
}
