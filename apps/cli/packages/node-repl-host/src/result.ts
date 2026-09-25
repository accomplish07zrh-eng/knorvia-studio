import {
  KNORVIA_MCP_BROWSER_SCREENSHOT_CONTENT_INDICES_META_KEY as SCREENSHOTS,
  KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY as APP,
} from "@knorvia/contracts/mcp";
import { isOfficialCuaImageRefText } from "@knorvia/cua/frame-contract";
import { CUA_APP_ASSOCIATIONS_META_KEY } from "@knorvia/cua/host-display-contract";
import type { NodeReplRunResult, NodeReplStructuredResult } from "@knorvia/core/repl";
import type { CallToolResult } from "@modelcontextprotocol/server";

type Block = CallToolResult["content"][number];
function embedded(text: string | undefined): NodeReplStructuredResult | undefined {
  try {
    const result: unknown = JSON.parse((text ?? "").replace(/^\s*=>\s*/, ""));
    if (!result || typeof result !== "object") return;
    const value = result as NodeReplStructuredResult;
    if (
      Array.isArray(value.content) &&
      value.content.every((block) => block && typeof block.type === "string")
    )
      return value;
  } catch {
    /* 普通返回值保留为文本，不把解析失败当作执行错误。 */
  }
}

export function toMcpRunResult(run: NodeReplRunResult): CallToolResult {
  const structured = run.structuredResults ?? [];
  const fallback = !run.error && structured.length === 0 ? embedded(run.result) : undefined;
  const results = structured.length ? structured : fallback ? [fallback] : [];
  const meta: Record<string, unknown> = Object.assign(
    {},
    run.responseMeta,
    ...results.map((item) => item._meta),
  );
  // 代码可写的元数据不能决定截图来源或目标应用，只有宿主的专用记录通道可信。
  for (const key of [
    SCREENSHOTS,
    APP,
    CUA_APP_ASSOCIATIONS_META_KEY,
    "knorvia/browserScreenshotContentIndices",
    "knorvia/nodeReplCuaApp",
    "knorvia.cua/app-associations-v1",
  ])
    delete meta[key];
  if (run.cuaApp) meta[APP] = run.cuaApp;
  const content: Block[] = [];
  const imageLocations = new Map<number, number>();
  if (!run.error) {
    const blocks = results.flatMap((item) => item.content as Block[]);
    let latestFrame = -1;
    for (let i = 0; i + 1 < blocks.length; i++) {
      const authority = blocks[i + 1];
      if (
        blocks[i]?.type === "image" &&
        authority?.type === "text" &&
        isOfficialCuaImageRefText(authority.text)
      )
        latestFrame = i;
    }
    const kept = blocks.filter((block, index) => {
      if (index < latestFrame && block.type === "image") {
        const next = blocks[index + 1];
        if (next?.type === "text" && isOfficialCuaImageRefText(next.text)) return false;
      }
      if (
        index <= latestFrame &&
        block.type === "text" &&
        isOfficialCuaImageRefText(block.text) &&
        blocks[index - 1]?.type === "image"
      )
        return false;
      return true;
    });
    if (structured.length) content.push(...kept);
    for (const [index, picture] of (run.images ?? []).entries()) {
      const duplicate = structured.length
        ? content.findIndex(
            (block) =>
              block.type === "image" &&
              block.data === picture.base64 &&
              block.mimeType === picture.mimeType,
          )
        : -1;
      imageLocations.set(index, duplicate < 0 ? content.length : duplicate);
      if (duplicate < 0)
        content.push({ type: "image", data: picture.base64, mimeType: picture.mimeType });
    }
    if (fallback) content.push(...kept);
    const text = [
      run.logs,
      results.length === 0 && run.result !== undefined ? `=> ${run.result}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (text) content.push({ type: "text", text });
  } else content.push({ type: "text", text: run.error.message });
  const indices = [
    ...new Set(
      (run.browserScreenshotImageIndices ?? []).flatMap((index) => {
        const output = imageLocations.get(index);
        return output === undefined ? [] : [output];
      }),
    ),
  ];
  if (indices.length) meta[SCREENSHOTS] = indices;
  if (content.some((block) => block.type === "image")) meta["knorvia/nodeReplEmittedImage"] = true;
  const structuredContent = results.findLast(
    (item) => item.structuredContent !== undefined,
  )?.structuredContent;
  return {
    content: content.length ? content : [{ type: "text", text: "(no output)" }],
    ...(run.error || results.some((item) => item.isError) ? { isError: true } : {}),
    ...(structuredContent ? { structuredContent } : {}),
    ...(Object.keys(meta).length ? { _meta: meta } : {}),
  };
}
