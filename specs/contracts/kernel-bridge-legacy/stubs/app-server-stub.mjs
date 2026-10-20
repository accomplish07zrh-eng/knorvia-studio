// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 桩门用的 transport 桩：只复述 NDJSON 请求/应答外壳，不实现任何旧协议方法。
// 任何用例若在它上面通过，说明断言没有真正触达行为。

const METHOD_NOT_FOUND = -32601;

process.stdin.setEncoding("utf8");
let buffer = "";

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf("\n");
  while (index >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line.length > 0) respond(line);
    index = buffer.indexOf("\n");
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});

function respond(line) {
  let decoded;
  try {
    decoded = JSON.parse(line);
  } catch {
    process.stdout.write(
      `${JSON.stringify({ id: "parse-error", error: { code: -32700, message: "Parse error" } })}\n`,
    );
    return;
  }
  const id = decoded && typeof decoded === "object" ? decoded.id : undefined;
  if (id === undefined) return;
  process.stdout.write(
    `${JSON.stringify({
      id,
      error: { code: METHOD_NOT_FOUND, message: `Method not found: ${decoded.method}` },
    })}\n`,
  );
}
