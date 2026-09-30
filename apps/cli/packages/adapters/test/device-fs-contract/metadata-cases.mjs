// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { portable } from "./fixture.mjs";
const hexes = [
  "",
  "616263",
  "610d0a620a",
  "efbbbf61",
  "fffe61000a00",
  "0001",
  "010203",
  "61626364656667010203",
  "61626364656601020304",
  "09",
  "0b",
  "0d",
  "0e",
  "c4e3bac3",
  "e4bda0e5a5bd",
  "61ff",
  "61ffff",
  "ff",
  "81308130",
  "d6d0cec4",
  "f09f9880",
  "f09f98",
  "ff0061",
  "efbbbf00",
];
export const metadataInputs = [
  ...hexes.flatMap((hex) => [
    { op: "detect", hex },
    { op: "decode", hex },
  ]),
  ...[
    "utf8",
    "utf-8",
    "utf16le",
    "ucs2",
    "ascii",
    "latin1",
    "binary",
    "hex",
    "base64",
    "base64url",
    "gb2312",
    "gbk",
    "gb18030",
  ].flatMap((encoding) => [
    { op: "decode", hex: "c4e3bac30d0a", encoding },
    { op: "encode", content: "你好\r\n😀", encoding },
    { op: "normalize", encoding },
    { op: "stream", hex: "e4bda0e5a5bd0d0a", encoding },
  ]),
  ...["", "a", "a\r", "a\n", "a\r\n", "a\r\nb\n", "a\r\nb\r\nc\n"].map((content) => ({
    op: "endings",
    content,
  })),
  ...[undefined, "LF", "CRLF"].map((lineEndings) => ({
    op: "apply",
    content: "a\r\nb\rc\n",
    lineEndings,
  })),
  { op: "encode", content: "你好", encoding: "gbk" },
  { op: "encode", content: "你好", encoding: "gb2312" },
];

export function observeMetadata(subject, input) {
  try {
    const m = subject.metadata;
    const buffer = input.hex === undefined ? undefined : Buffer.from(input.hex, "hex");
    let value;
    switch (input.op) {
      case "detect":
        value = m.detectTextEncoding(buffer, "controlled.txt");
        break;
      case "decode":
        value = m.decodeTextBuffer({ buffer, encoding: input.encoding, path: "controlled.txt" });
        break;
      case "encode":
        value = m.encodeTextContent({ ...input, path: "controlled.txt" });
        break;
      case "normalize":
        value = m.shouldNormalizeLineEndings(input.encoding);
        break;
      case "endings":
        value = {
          detected: m.detectLineEndings(input.content),
          normalized: m.normalizeLineEndings(input.content),
        };
        break;
      case "apply":
        value = m.applyRequestedLineEndings(input.content, input.lineEndings);
        break;
      case "stream": {
        const decoder = m.createStreamingTextDecoder(input.encoding);
        const writes = [];
        for (const byte of buffer) writes.push(decoder.write(Buffer.from([byte])));
        value = { writes, ending: decoder.end() };
        break;
      }
      default:
        throw new Error("Unknown metadata case");
    }
    return { value: portable(value) };
  } catch (error) {
    return { error: portable(error) };
  }
}
