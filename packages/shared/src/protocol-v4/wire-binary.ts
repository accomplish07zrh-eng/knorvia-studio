// Modified 2026-09-30 under the retained root Apache-2.0 scope.
// Contract/exposure: specs/knorvia-protocol-wire-helpers-20260930.md.
// Pure Node/browser byte operations; wire schema remains unchanged.
import { z } from "zod";

export const topicWireBase64Schema = z
  .string()
  .min(4)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u);

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, byte) => {
  let remainder = byte;
  for (let shift = 0; shift < 8; shift++) {
    remainder = (remainder >>> 1) ^ ((remainder & 1) * 0xedb88320);
  }
  return remainder >>> 0;
});

export function crc32WireBytes(bytes: Uint8Array): string {
  let remainder = 0xffffffff;
  for (const byte of bytes) {
    remainder = CRC32_TABLE[(remainder ^ byte) & 255]! ^ (remainder >>> 8);
  }
  return (~remainder >>> 0).toString(16).padStart(8, "0");
}

// 每段以完整三字节组结束：中间段不会出现 padding，也避免展开大数组耗尽栈。
const BASE64_INPUT_BLOCK_BYTES = 3 * 4096;

export function encodeWireBytesBase64(bytes: Uint8Array): string {
  const encoded: string[] = [];
  for (let start = 0; start < bytes.byteLength; start += BASE64_INPUT_BLOCK_BYTES) {
    const block = bytes.subarray(start, start + BASE64_INPUT_BLOCK_BYTES);
    encoded.push(btoa(String.fromCharCode(...block)));
  }
  return encoded.join("");
}

export function decodeWireBase64(value: string): Uint8Array | null {
  // 原 schema 决定接受域；atob 本身会接受空白及无 padding，不能代替协议校验。
  if (!topicWireBase64Schema.safeParse(value).success) return null;
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
