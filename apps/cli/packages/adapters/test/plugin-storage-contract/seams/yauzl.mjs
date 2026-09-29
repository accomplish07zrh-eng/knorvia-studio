// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { getWorld, makeError, record } from "./state.mjs";

export class Entry {
  constructor(spec) {
    this.externalFileAttributes = spec.externalFileAttributes ?? 0;
    this.fileName = spec.fileName;
    this.generalPurposeBitFlag = spec.generalPurposeBitFlag ?? 0;
    this.uncompressedSize = spec.uncompressedSize ?? 0;
    this.__spec = spec;
  }
}

class SyntheticReadable extends Readable {
  constructor(spec) {
    super();
    this.spec = spec;
    this.index = 0;
    this.repeatIndex = 0;
  }

  _read() {
    const chunks = this.spec.chunks ?? [];
    if (this.index < chunks.length) {
      const chunk = chunks[this.index++];
      this.push(typeof chunk === "string" ? chunk : Buffer.from(chunk));
      return;
    }
    const repeat = this.spec.repeat;
    if (repeat && this.repeatIndex < repeat.count) {
      this.repeatIndex += 1;
      this.push(Buffer.alloc(repeat.bytes, repeat.fill ?? 0x61));
      return;
    }
    if (this.spec.streamError && !this.__failed) {
      this.__failed = true;
      this.destroy(makeError(this.spec.streamError, "Synthetic ZIP stream error"));
      return;
    }
    this.push(null);
  }
}

export class ZipFile extends EventEmitter {
  constructor(spec, options) {
    super();
    this.lazyEntries = options.lazyEntries === true;
    this.validateEntrySizes = options.validateEntrySizes === true;
    this.entries = (spec.entries ?? []).map((entry) => new Entry(entry));
    this.index = 0;
    this.closed = false;
  }

  readEntry() {
    record("zip.readEntry", { index: this.index });
    queueMicrotask(() => {
      if (this.closed) return;
      if (this.index >= this.entries.length) {
        this.emit("end");
        return;
      }
      this.emit("entry", this.entries[this.index++]);
    });
  }

  openReadStream(entry, callback) {
    record("zip.openReadStream", { fileName: entry.fileName });
    const spec = entry.__spec;
    queueMicrotask(() => {
      if (spec.openError) {
        callback(makeError(spec.openError, "Synthetic openReadStream error"), null);
      } else {
        callback(null, new SyntheticReadable(spec));
      }
    });
  }

  close() {
    this.closed = true;
    record("zip.close");
  }
}

export function open(path, options, callback) {
  const world = getWorld();
  record("zip.open", { path, options });
  const spec = world.config?.zip ?? {};
  queueMicrotask(() => {
    if (spec.openError) {
      callback(makeError(spec.openError, "Synthetic ZIP open error"), null);
    } else {
      callback(null, new ZipFile(spec, options));
    }
  });
}

export default { Entry, ZipFile, open };
