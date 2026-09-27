// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { isAbsolute, resolve } from "node:path";
import type { NodeReplRunResult } from "../../repl/session-contract.js";
import type { ToolExecutionContext } from "../types.js";

const extensions: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
};

export async function saveBrowserScreenshots(
  output: NodeReplRunResult,
  context: ToolExecutionContext,
): Promise<string[]> {
  const store = context.artifactStore;
  const write = store?.writeToolResultBinaryArtifact;
  const paths: string[] = [];
  if (!write || !output.images) return paths;
  for (const index of output.browserScreenshotImageIndices ?? []) {
    const image = output.images[index];
    if (!image) continue;
    const mime = image.mimeType.split(";", 1)[0]!.trim().toLowerCase();
    try {
      const saved = await write.call(
        store,
        {
          sessionId: context.sessionId,
          turnId: context.turnId,
          toolCallId: context.toolCallId,
          toolName: "js",
          content: Buffer.from(image.base64, "base64"),
          contentType: image.mimeType,
          extension: Object.hasOwn(extensions, mime) ? extensions[mime]! : ".png",
          retention: "session",
          trace: context.traceContext,
        },
        { signal: context.abortSignal },
      );
      if (saved.path) paths.push(isAbsolute(saved.path) ? saved.path : resolve(saved.path));
    } catch (failure) {
      // 截图路径只是辅助输出；存储故障不推翻浏览器结果，但已取消请求仍传播原错误。
      if (context.abortSignal.aborted) throw failure;
    }
  }
  return paths;
}
