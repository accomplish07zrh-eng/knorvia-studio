// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type ByteSource = VSBuffer | Uint8Array;

function bytesOf(source: ByteSource): Uint8Array {
  return source instanceof VSBuffer ? source.buffer : source;
}

function totalOf(parts: readonly VSBuffer[]): number {
  let sum = 0;
  for (const part of parts) {
    sum += part.byteLength;
  }
  return sum;
}

function layOut(target: Uint8Array, parts: readonly VSBuffer[]): void {
  let cursor = 0;
  for (const part of parts) {
    target.set(part.buffer, cursor);
    cursor += part.byteLength;
  }
}

export class VSBuffer {
  readonly buffer: Uint8Array;
  readonly byteLength: number;

  private constructor(bytes: Uint8Array) {
    this.buffer = bytes;
    this.byteLength = bytes.length;
  }

  static alloc(size: number): VSBuffer {
    const fresh = new Uint8Array(size);
    return VSBuffer.wrap(fresh);
  }

  static wrap(bytes: Uint8Array): VSBuffer {
    return new VSBuffer(bytes);
  }

  static fromString(text: string): VSBuffer {
    return VSBuffer.wrap(encoder.encode(text));
  }

  static concat(parts: VSBuffer[], size?: number): VSBuffer {
    const target = new Uint8Array(size ?? totalOf(parts));
    layOut(target, parts);
    return VSBuffer.wrap(target);
  }

  toString(): string {
    return decoder.decode(this.buffer);
  }

  slice(from: number, to?: number): VSBuffer {
    return VSBuffer.wrap(this.buffer.slice(from, to));
  }

  set(source: ByteSource, at = 0): void {
    this.buffer.set(bytesOf(source), at);
  }

  readUInt8(at: number): number {
    const octet = this.buffer[at];
    return octet;
  }

  writeUInt8(octet: number, at: number): void {
    this.buffer[at] = octet;
  }

  readUInt32BE(at: number): number {
    const bytes = this.buffer;
    let gathered = 0;
    for (let step = 0; step < 4; step += 1) {
      gathered = gathered * 256 + bytes[at + step];
    }
    return gathered >>> 0;
  }

  writeUInt32BE(word: number, at: number): void {
    const bytes = this.buffer;
    let rest = word >>> 0;
    for (let step = 3; step >= 0; step -= 1) {
      const octet = rest % 256;
      bytes[at + step] = octet;
      rest = (rest - octet) / 256;
    }
  }
}
