// SPDX-License-Identifier: Apache-2.0
// UUID 生成工具：普通命令与后台唤醒共用 v7 形态，兼容层另提供 v4 形态（B1/B2）。
// 字节布局（48 位时间戳大端、版本位、变体位）是消费方依赖的兼容面，逐字节保持。

const HEX_DIGITS = "0123456789abcdef";

/** 字节到两位十六进制的查表，模块加载时建立一次。 */
function buildByteHexTable(): string[] {
  const table: string[] = [];
  for (let value = 0; value <= 0xff; value += 1) {
    table.push(`${HEX_DIGITS[value >> 4]}${HEX_DIGITS[value & 0x0f]}`);
  }
  return table;
}

const BYTE_HEX_TABLE = buildByteHexTable();

/** 分段渲染的字节区间：8-4-4-4-12 十六进制分组对应 4/2/2/2/6 字节。 */
const UUID_BYTE_SEGMENTS: ReadonlyArray<readonly [number, number]> = [
  [0, 4],
  [4, 6],
  [6, 8],
  [8, 10],
  [10, 16],
];

/** 把 16 字节缓冲渲染成分段的 UUID 文本。 */
function renderUuidText(buffer: Uint8Array): string {
  return UUID_BYTE_SEGMENTS.map(([start, end]) =>
    Array.from(buffer.subarray(start, end), (byte) => BYTE_HEX_TABLE[byte]!).join(""),
  ).join("-");
}

/** 给随机字节打上 v4 的版本位与变体位后渲染。 */
function renderRandomUuid(randomBytes: Uint8Array): string {
  const shaped = new Uint8Array(randomBytes);
  shaped[6] = (shaped[6]! & 0x0f) | 0x40;
  shaped[8] = (shaped[8]! & 0x3f) | 0x80;
  return renderUuidText(shaped);
}

export function uuidv7(now: number = Date.now()): string {
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  // 低 48 位放毫秒时间戳（大端序），从最低位字节倒着写入。
  let timestamp = BigInt(now);
  for (let index = 5; index >= 0; index -= 1) {
    buffer[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  // 高 4 位固定版本 7，变体位固定 10（随机低位保持不动）。
  buffer[6] = 0x70 | (buffer[6]! & 0x0f);
  buffer[8] = 0x80 | (buffer[8]! & 0x3f);
  return renderUuidText(buffer);
}

export function createUuid(): string {
  const runtimeCrypto = globalThis.crypto;
  if (runtimeCrypto?.randomUUID) {
    return runtimeCrypto.randomUUID();
  }

  const randomBytes = new Uint8Array(16);
  if (runtimeCrypto?.getRandomValues) {
    runtimeCrypto.getRandomValues(randomBytes);
  } else {
    // 部分移动端 WebView 的 crypto 两项能力都没有；退回 Math.random 填充，
    // 保证首屏仍能生成 tab / history / request 需要的临时 ID 而不崩。
    for (let index = 0; index < randomBytes.length; index += 1) {
      randomBytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return renderRandomUuid(randomBytes);
}
