import { VSBuffer } from "./buffer.js";

export interface IReader {
  read(bytes: number): VSBuffer;
}

export interface IWriter {
  write(buffer: VSBuffer): void;
}

export class BufferReader implements IReader {
  private position = 0;

  constructor(private buffer: VSBuffer) {}

  read(bytes: number): VSBuffer {
    const result = this.buffer.slice(this.position, this.position + bytes);
    this.position += result.byteLength;
    return result;
  }
}

export class BufferWriter implements IWriter {
  private readonly buffers: VSBuffer[] = [];

  write(buffer: VSBuffer): void {
    this.buffers.push(buffer);
  }

  get buffer(): VSBuffer {
    return VSBuffer.concat(this.buffers);
  }
}

enum Kind {
  Undefined = 0,
  String = 1,
  Buffer = 2,
  VSBuffer = 3,
  Array = 4,
  Object = 5,
  Int = 6,
}

function byteBuffer(value: number): VSBuffer {
  const buffer = VSBuffer.alloc(1);
  buffer.writeUInt8(value, 0);
  return buffer;
}

const vqlZero = byteBuffer(0);
const undefinedTag = byteBuffer(Kind.Undefined);
const stringTag = byteBuffer(Kind.String);
const bufferTag = byteBuffer(Kind.Buffer);
const vsBufferTag = byteBuffer(Kind.VSBuffer);
const arrayTag = byteBuffer(Kind.Array);
const objectTag = byteBuffer(Kind.Object);
const intTag = byteBuffer(Kind.Int);

function writeVQL(writer: IWriter, value: number): void {
  if (value === 0) {
    writer.write(vqlZero);
    return;
  }

  let length = 0;
  let remaining = value;
  while (remaining !== 0) {
    length++;
    remaining = remaining >>> 7;
  }

  const buffer = VSBuffer.alloc(length);
  let offset = 0;
  while (value !== 0) {
    buffer.buffer[offset] = value & 127;
    value = value >>> 7;
    if (value > 0) {
      buffer.buffer[offset] |= 128;
    }
    offset++;
  }
  writer.write(buffer);
}

function readVQL(reader: IReader): number {
  let value = 0;
  for (let shift = 0; ; shift += 7) {
    const next = reader.read(1);
    value |= (next.buffer[0] & 127) << shift;
    if (!(next.buffer[0] & 128)) {
      return value;
    }
  }
}

const nestedBytesMarker = "__knorvia_rpc_nested_uint8array_v1";
const legacyNestedBytesMarker = "__zcode_rpc_nested_uint8array_v1";

interface Base64Buffer extends ArrayLike<number> {
  toString(encoding: string): string;
}

interface Base64BufferConstructor {
  from(value: Uint8Array | string, encoding?: string): Base64Buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  const Buffer = (globalThis as typeof globalThis & { Buffer?: Base64BufferConstructor }).Buffer;
  if (Buffer) {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const Buffer = (globalThis as typeof globalThis & { Buffer?: Base64BufferConstructor }).Buffer;
  if (Buffer) {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeReplacer(_key: string, value: any): any {
  if (value instanceof Uint8Array) {
    return { [nestedBytesMarker]: true, base64: bytesToBase64(value) };
  }
  return value;
}

function isEncodedBytes(value: any): value is { base64: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value[nestedBytesMarker] === true || value[legacyNestedBytesMarker] === true) &&
    typeof value.base64 === "string" &&
    Object.keys(value).length === 2
  );
}

function decodeReviver(_key: string, value: any): any {
  if (isEncodedBytes(value)) {
    return base64ToBytes(value.base64);
  }
  return value;
}

export function serialize(writer: IWriter, data: any): void {
  if (typeof data === "undefined") {
    writer.write(undefinedTag);
    return;
  }
  if (typeof data === "string") {
    const buffer = VSBuffer.fromString(data);
    writer.write(stringTag);
    writeVQL(writer, buffer.byteLength);
    writer.write(buffer);
    return;
  }
  if (data instanceof VSBuffer) {
    writer.write(vsBufferTag);
    writeVQL(writer, data.byteLength);
    writer.write(data);
    return;
  }
  if (data instanceof Uint8Array) {
    const buffer = VSBuffer.wrap(data);
    writer.write(bufferTag);
    writeVQL(writer, buffer.byteLength);
    writer.write(buffer);
    return;
  }
  if (Array.isArray(data)) {
    writer.write(arrayTag);
    writeVQL(writer, data.length);
    for (const element of data) {
      serialize(writer, element);
    }
    return;
  }
  if (typeof data === "number" && (data | 0) === data) {
    writer.write(intTag);
    writeVQL(writer, data);
    return;
  }

  const json = JSON.stringify(data, encodeReplacer);
  const buffer = VSBuffer.fromString(json);
  writer.write(objectTag);
  writeVQL(writer, buffer.byteLength);
  writer.write(buffer);
}

export function deserialize(reader: IReader): any {
  const kind = reader.read(1).readUInt8(0);
  switch (kind) {
    case Kind.Undefined:
      return undefined;
    case Kind.String:
      return reader.read(readVQL(reader)).toString();
    case Kind.Buffer:
      return reader.read(readVQL(reader)).buffer;
    case Kind.VSBuffer:
      return reader.read(readVQL(reader));
    case Kind.Array: {
      const length = readVQL(reader);
      const result: any[] = [];
      for (let index = 0; index < length; index++) {
        result.push(deserialize(reader));
      }
      return result;
    }
    case Kind.Object:
      return JSON.parse(reader.read(readVQL(reader)).toString(), decodeReviver);
    case Kind.Int:
      return readVQL(reader);
  }
}
