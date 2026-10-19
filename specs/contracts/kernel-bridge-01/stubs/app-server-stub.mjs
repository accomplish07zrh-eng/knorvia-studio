// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 桩门专用：只实现 app-server --stdio 的 transport 签名（读 NDJSON、按 id 回错误），
// 不实现任何 v4 方法或帧语义。契约测试对它必须全失败，证明用例不是自证。
import { createInterface } from "node:readline";

const reader = createInterface({ input: process.stdin });
reader.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.method === undefined || message.id === undefined) return;
  process.stdout.write(
    `${JSON.stringify({
      id: message.id,
      error: { code: -32601, message: "Method not found (contract stub)" },
    })}\n`,
  );
});
reader.on("close", () => {
  process.exitCode = 0;
});
