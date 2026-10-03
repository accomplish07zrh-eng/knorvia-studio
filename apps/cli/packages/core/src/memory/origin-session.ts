// Pure memory-origin projection; specs/knorvia-memory-origin.md.
// Source exposure and transition licence are retained; no clean-room claim.
import { isMap, parseDocument } from "yaml";
import { memoryFileRelativePath } from "./memory-file-path.js";

type Frontmatter = {
  opening: string;
  yaml: string;
  closing: string;
  body: string;
  newline: string;
};
function frontmatterOf(text: string): Frontmatter | undefined {
  const headerEnd = text.indexOf("\n") + 1;
  if (headerEnd === 0) return;
  const opening = text.slice(0, headerEnd);
  const header = opening.charCodeAt(0) === 0xfeff ? opening.slice(1) : opening;
  if (header !== "---\n" && header !== "---\r\n") return;
  // 从 opening 后寻找换行加 fence，保留既有立即空 fence 不匹配的语法边界。
  for (
    let newlineAt = text.indexOf("\n---", headerEnd);
    newlineAt >= 0;
    newlineAt = text.indexOf("\n---", newlineAt + 1)
  ) {
    const end = newlineAt + 4;
    const suffix = text.slice(end, end + 2);
    if (end !== text.length && suffix[0] !== "\n" && suffix !== "\r\n") continue;
    const start = text[newlineAt - 1] === "\r" ? newlineAt - 1 : newlineAt;
    return {
      opening,
      yaml: text.slice(headerEnd, start),
      closing: text.slice(start, end),
      body: text.slice(end),
      newline: header.endsWith("\r\n") ? "\r\n" : "\n",
    };
  }
}

export function stampMemoryOriginSessionId(input: {
  content: string;
  filePath: string;
  memoryRoot: string | undefined;
  sessionId: string;
}): string {
  const { content, filePath, memoryRoot, sessionId } = input;
  if (
    !memoryRoot ||
    !filePath.endsWith(".md") ||
    memoryFileRelativePath(memoryRoot, filePath) === undefined
  )
    return content;
  const frame = frontmatterOf(content);
  if (!frame) return content;
  const document = parseDocument(frame.yaml);
  if (document.errors.length) return content;
  try {
    let metadata = document.get("metadata", true);
    if (metadata === undefined) {
      // Document.set 不会立刻把普通对象变成 YAMLMap；必须先创建节点，否则缺 metadata 时静默漏写 origin。
      metadata = document.createNode({});
      document.set("metadata", metadata);
    }
    if (!isMap(metadata)) return content;
    const origin = metadata.get("originSessionId");
    if (typeof origin === "string" && origin.length > 0) return content;
    metadata.delete("node_type");
    metadata.items.unshift(document.createPair("node_type", "memory"));
    metadata.set("originSessionId", sessionId);
  } catch {
    return content;
  }
  const rendered = document.toString();
  const yaml = (rendered.endsWith("\n") ? rendered.slice(0, -1) : rendered)
    .split("\n")
    .join(frame.newline);
  return frame.opening + yaml + frame.closing + frame.body;
}
