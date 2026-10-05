import assert from "node:assert/strict";
import test from "node:test";
import { toAiSdkMessages } from "../src/model/transform.js";

// 回归：并行读取两张图片时，图片曾紧跟各自的读取结果插入
//   tool① → user(图片①) → tool② → user(图片②)
// AI SDK 在遇到 user(图片①) 时发现 tool② 尚未回填，抛出 MissingToolResultsError，对话中断。
// 正确顺序：tool① → tool② → user(图片①, 图片②)。

const png = (byte: string) => `data:image/png;base64,${byte}`;

const messages = [
  { role: "user", content: "看看这两张图" },
  {
    role: "assistant",
    content: "",
    toolCalls: [
      { id: "call-1", name: "Read", input: { path: "a.png" } },
      { id: "call-2", name: "Read", input: { path: "b.png" } },
    ],
  },
  {
    role: "tool",
    toolCallId: "call-1",
    toolName: "Read",
    content: [{ type: "image", dataUrl: png("AAE=") }],
  },
  {
    role: "tool",
    toolCallId: "call-2",
    toolName: "Read",
    content: [{ type: "image", dataUrl: png("AAI=") }],
  },
  { role: "user", content: "继续" },
] as never;

/** 与 AI SDK convertToLanguageModelPrompt 相同的规则：user 消息出现时不得有未回填的工具调用。 */
function assertNoMissingToolResults(projected: Array<{ role: string; content: unknown }>) {
  const pending = new Set<string>();
  for (const message of projected) {
    const parts = Array.isArray(message.content) ? (message.content as any[]) : [];
    if (message.role === "assistant")
      for (const part of parts) if (part.type === "tool-call") pending.add(part.toolCallId);
    if (message.role === "tool")
      for (const part of parts) if (part.type === "tool-result") pending.delete(part.toolCallId);
    if (message.role === "user" || message.role === "system")
      assert.deepEqual([...pending], [], "user message arrived before all tool results");
  }
  assert.deepEqual([...pending], []);
}

test("parallel tool-result images follow all tool results, in their original order", () => {
  const projected = toAiSdkMessages(messages, { providerKind: "openai" }) as any[];
  assertNoMissingToolResults(projected);
  const roles = projected.map((message) => message.role);
  assert.deepEqual(roles, ["user", "assistant", "tool", "tool", "user", "user"]);
  const media = projected[4].content.filter((part: any) => part.type === "image");
  assert.deepEqual(
    media.map((part: any) => String(part.image)),
    ["AAE=", "AAI="],
    "image ① stays before image ②",
  );
});

test("a single tool result with an image still gets its image right after it", () => {
  const single = [
    (messages as any[])[0],
    { role: "assistant", content: "", toolCalls: [(messages as any[])[1].toolCalls[0]] },
    (messages as any[])[2],
  ] as never;
  const projected = toAiSdkMessages(single, { providerKind: "openai" }) as any[];
  assertNoMissingToolResults(projected);
  assert.deepEqual(
    projected.map((message) => message.role),
    ["user", "assistant", "tool", "user"],
  );
});
