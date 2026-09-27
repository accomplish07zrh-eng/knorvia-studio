// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserCommand, BrowserRecordingOptions } from "@knorvia/contracts/browser-control";
import type { BrowserExecuteFn } from "./facade-contract.js";
import { expectPayload } from "./result.js";
export class BrowserRecordingAPI {
  #send: BrowserExecuteFn;
  constructor(run: BrowserExecuteFn) {
    this.#send = run;
  }
  async #recording(command: BrowserCommand) {
    const result = await this.#send(command);
    return expectPayload(command, result, result.recording, "recording");
  }
  start(options?: BrowserRecordingOptions) {
    return this.#recording({ method: "recordingStart", options });
  }
  async status(recordingId: string, options?: { outputPath?: string }) {
    if (!recordingId) throw new TypeError("recording.status requires a recording id");
    return this.#recording({
      method: "recordingStatus",
      recordingId,
      outputPath: options?.outputPath,
    });
  }
  async cancel(recordingId: string) {
    if (!recordingId) throw new TypeError("recording.cancel requires a recording id");
    return this.#recording({ method: "recordingCancel", recordingId });
  }
}
