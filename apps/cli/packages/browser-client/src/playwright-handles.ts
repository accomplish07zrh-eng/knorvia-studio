// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { Run } from "./playwright-contract.js";
import { readAction, sendAction, withActionContext } from "./playwright-runtime.js";

export class PlaywrightDownload {
  #run: Run;
  #id: string;
  constructor(run: Run, downloadId: string) {
    this.#run = run;
    this.#id = downloadId;
  }
  path({ timeoutMs }: { timeoutMs?: number } = {}): Promise<string | null> {
    return readAction(this.#run, { name: "downloadPath", downloadId: this.#id, timeoutMs });
  }
}

export class PlaywrightFileChooser {
  #run: Run;
  #id: string;
  #multiple: boolean;
  constructor(run: Run, fileChooserId: string, multiple: boolean) {
    this.#run = run;
    this.#id = fileChooserId;
    this.#multiple = multiple;
  }
  isMultiple(): boolean {
    return this.#multiple;
  }
  async setFiles(
    files: string | string[],
    { timeoutMs }: { timeoutMs?: number } = {},
  ): Promise<void> {
    if (files === null || files === undefined)
      throw new Error("fileChooser.setFiles requires files");
    const names = Array.isArray(files) ? files : [files];
    if (!names.length) throw new Error("fileChooser.setFiles requires at least one file");
    await withActionContext(
      () =>
        sendAction(this.#run, {
          name: "fileChooserSetFiles",
          fileChooserId: this.#id,
          files: names,
          timeoutMs,
        }),
      "fileChooser.setFiles failed",
    );
  }
}
