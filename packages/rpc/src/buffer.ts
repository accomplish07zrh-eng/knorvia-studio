export class VSBuffer {
  readonly buffer: Uint8Array;
  readonly byteLength: number;

  private constructor(buffer: Uint8Array) {
    this.buffer = buffer;
    this.byteLength = buffer.byteLength;
  }

  static alloc(byteLength: number): VSBuffer {
    return new VSBuffer(new Uint8Array(byteLength));
  }

  static wrap(buffer: Uint8Array): VSBuffer {
    return new VSBuffer(buffer);
  }

  static fromString(str: string): VSBuffer {
    return new VSBuffer(new TextEncoder().encode(str));
  }

  static concat(buffers: VSBuffer[], totalLength?: number): VSBuffer {
    const length = totalLength ?? buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
    const result = VSBuffer.alloc(length);
    let offset = 0;
    for (const buffer of buffers) {
      result.set(buffer, offset);
      offset += buffer.byteLength;
    }
    return result;
  }

  toString(): string {
    return new TextDecoder().decode(this.buffer);
  }

  slice(start: number, end?: number): VSBuffer {
    return new VSBuffer(this.buffer.slice(start, end));
  }

  set(source: VSBuffer | Uint8Array, offset = 0): void {
    const raw = source instanceof VSBuffer ? source.buffer : source;
    this.buffer.set(raw, offset);
  }

  readUInt8(offset: number): number {
    return this.buffer[offset];
  }

  writeUInt8(value: number, offset: number): void {
    this.buffer[offset] = value;
  }

  readUInt32BE(offset: number): number {
    return (
      ((this.buffer[offset] << 24) |
        (this.buffer[offset + 1] << 16) |
        (this.buffer[offset + 2] << 8) |
        this.buffer[offset + 3]) >>>
      0
    );
  }

  writeUInt32BE(value: number, offset: number): void {
    this.buffer[offset] = (value >>> 24) & 255;
    this.buffer[offset + 1] = (value >>> 16) & 255;
    this.buffer[offset + 2] = (value >>> 8) & 255;
    this.buffer[offset + 3] = value & 255;
  }
}
