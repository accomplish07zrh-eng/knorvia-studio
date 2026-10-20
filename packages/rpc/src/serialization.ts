// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import { VSBuffer } from "./buffer.js";

export interface IReader {
  read(bytes: number): VSBuffer;
}

export interface IWriter {
  write(buffer: VSBuffer): void;
}

export class BufferReader implements IReader {
  #offset = 0;

  constructor(private readonly source: VSBuffer) {}

  read(bytes: number): VSBuffer {
    const end = this.#offset + bytes;
    const window = this.source.slice(this.#offset, end);
    this.#offset += window.byteLength;
    return window;
  }
}

export class BufferWriter implements IWriter {
  readonly #queue: VSBuffer[] = [];

  write(buffer: VSBuffer): void {
    this.#queue.push(buffer);
  }

  get buffer(): VSBuffer {
    return VSBuffer.concat(this.#queue);
  }
}

const UNDEFINED = 0x00;
const STRING = 0x01;
const BYTES = 0x02;
const VS_BUFFER = 0x03;
const LIST = 0x04;
const JSON_OBJECT = 0x05;
const INTEGER = 0x06;

const ZERO_BYTE = VSBuffer.wrap(Uint8Array.of(0));

const SINGLE_BYTES: readonly VSBuffer[] = [
  UNDEFINED,
  STRING,
  BYTES,
  VS_BUFFER,
  LIST,
  JSON_OBJECT,
  INTEGER,
].map((tag) => VSBuffer.wrap(Uint8Array.of(tag)));

function putQuantity(target: IWriter, quantity: number): void {
  if (quantity === 0) {
    target.write(ZERO_BYTE);
    return;
  }

  const pieces: number[] = [];
  let remainder = quantity >>> 0;
  while (remainder > 0) {
    pieces.push(remainder % 128);
    remainder = Math.floor(remainder / 128);
  }

  const scratch = VSBuffer.alloc(pieces.length);
  for (let index = 0; index < pieces.length; index += 1) {
    const last = index === pieces.length - 1;
    scratch.writeUInt8(last ? pieces[index] : pieces[index] + 128, index);
  }
  target.write(scratch);
}

function takeQuantity(target: IReader): number {
  let result = 0;
  let position = 0;
  let more = true;
  while (more) {
    const octet = target.read(1).readUInt8(0);
    more = octet >= 128;
    result += (octet % 128) * 2 ** position;
    position += 7;
  }
  return result | 0;
}

const CURRENT_MARK = "__knorvia_rpc_nested_uint8array_v1";
const LEGACY_MARK = "__zcode_rpc_nested_uint8array_v1";
const PAYLOAD_KEY = "base64";

type ByteHost = {
  from(
    input: Uint8Array | string,
    encoding?: string,
  ): Uint8Array & {
    toString(encoding: string): string;
  };
};

function nodeBuffer(): ByteHost | undefined {
  return (globalThis as unknown as { Buffer?: ByteHost }).Buffer;
}

function encodeBase64(raw: Uint8Array): string {
  const node = nodeBuffer();
  if (node !== undefined) {
    return node.from(raw).toString("base64");
  }
  const symbols: string[] = [];
  for (const octet of raw) {
    symbols.push(String.fromCharCode(octet));
  }
  return globalThis.btoa(symbols.join(""));
}

function decodeBase64(text: string): Uint8Array {
  const node = nodeBuffer();
  if (node !== undefined) {
    return new Uint8Array(node.from(text, "base64"));
  }
  const plain = globalThis.atob(text);
  const raw = new Uint8Array(plain.length);
  let cursor = 0;
  while (cursor < plain.length) {
    raw[cursor] = plain.charCodeAt(cursor);
    cursor += 1;
  }
  return raw;
}

function substituteBytes(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { [CURRENT_MARK]: true, [PAYLOAD_KEY]: encodeBase64(value) };
  }
  return value;
}

function restoreBytes(_key: string, value: unknown): unknown {
  const isCandidate =
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype;
  if (!isCandidate) {
    return value;
  }
  const fields = value as Record<string, unknown>;
  const signatures = Object.keys(fields);
  const labelled = fields[CURRENT_MARK] === true || fields[LEGACY_MARK] === true;
  if (!labelled || signatures.length !== 2 || typeof fields[PAYLOAD_KEY] !== "string") {
    return value;
  }
  return decodeBase64(fields[PAYLOAD_KEY]);
}

function writeBody(target: IWriter, tag: number, body: VSBuffer): void {
  target.write(SINGLE_BYTES[tag]);
  putQuantity(target, body.byteLength);
  target.write(body);
}

export function serialize(writer: IWriter, data: any): void {
  switch (typeof data) {
    case "undefined":
      writer.write(SINGLE_BYTES[UNDEFINED]);
      return;
    case "string":
      writeBody(writer, STRING, VSBuffer.fromString(data));
      return;
    case "number":
      if ((data | 0) === data) {
        writer.write(SINGLE_BYTES[INTEGER]);
        putQuantity(writer, data);
        return;
      }
      break;
  }

  if (data instanceof VSBuffer) {
    writeBody(writer, VS_BUFFER, data);
  } else if (data instanceof Uint8Array) {
    writeBody(writer, BYTES, VSBuffer.wrap(data));
  } else if (Array.isArray(data)) {
    writer.write(SINGLE_BYTES[LIST]);
    putQuantity(writer, data.length);
    for (const member of data) {
      serialize(writer, member);
    }
  } else {
    writeBody(writer, JSON_OBJECT, VSBuffer.fromString(JSON.stringify(data, substituteBytes)));
  }
}

export function deserialize(reader: IReader): any {
  const tag = reader.read(1).readUInt8(0);
  switch (tag) {
    case UNDEFINED:
      return undefined;
    case STRING:
      return reader.read(takeQuantity(reader)).toString();
    case BYTES:
      return reader.read(takeQuantity(reader)).buffer;
    case VS_BUFFER:
      return reader.read(takeQuantity(reader));
    case LIST: {
      const members: any[] = [];
      let remaining = takeQuantity(reader);
      while (remaining > 0) {
        members.push(deserialize(reader));
        remaining -= 1;
      }
      return members;
    }
    case JSON_OBJECT:
      return JSON.parse(reader.read(takeQuantity(reader)).toString(), restoreBytes);
    case INTEGER:
      return takeQuantity(reader);
  }
  return undefined;
}
