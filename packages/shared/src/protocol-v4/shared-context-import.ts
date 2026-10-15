// SPDX-License-Identifier: Apache-2.0
// 共享上下文导入状态：v2 形态（带 canonical 分享 URL）与 legacy 形态（只有标题）的并集（B26）。
// 两种形态都 strict。v2 的 shareUrl 硬绑 `/cn/share/<code>` 且不接受 query/hash；将来换 canonical
// 时要先加一个接受旧形状的 legacy 分支（照这里的做法）。
import { z } from "zod";

// 三处复用的构件抽到模块顶部：非空裁剪文本、分享链接校验、生命周期枚举。
// 抽出来既省掉三段重复链，也让下面每个字段都落在一行一句上，读的时候一眼能扫完。
const trimmedRequiredText = z.string().trim().min(1);

// 硬编码在这条 refine 上的报错文案是持久化校验面的一部分，改一个字会让存量会话读不出来。
const SHARE_URL_RULE = "shareUrl must use the canonical /cn/share/<code> path";

// 分享链接必须是 http(s) 且 pathname 严格等于 /cn/share/<code>：query 与 hash 一律不收，
// 否则同一个会话会因为带了追踪参数被当成两条不同的 provenance。URL 构造失败即判否。
const canonicalShareUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    const httpFamily = parsed.protocol === "https:" || parsed.protocol === "http:";
    const scopedPath = /^\/cn\/share\/[^/]+$/u.test(parsed.pathname);
    return httpFamily && parsed.search === "" && parsed.hash === "" && scopedPath;
  } catch {
    return false;
  }
};

// 生命周期四态按引擎推进顺序排列，顺序本身不是协议，取值才是。
const importLifecycle = z.enum(["pending", "reserved", "attached", "discarded"]);

// v2：完整形态，shareUrl 必须是 http(s) 且 pathname 严格匹配 `/cn/share/<code>`。
const currentImportState = z
  .object({
    contextId: trimmedRequiredText,
    title: trimmedRequiredText,
    shareUrl: z.string().url().refine(canonicalShareUrl, SHARE_URL_RULE),
    status: importLifecycle,
  })
  .strict();

// legacy：早期快照只存一个非空标题；两种形态都不接受第三种形状。
const earlierImportState = z.object({ title: trimmedRequiredText }).strict();

export const sharedContextImportStateSchema = z.union([currentImportState, earlierImportState]);

export type SharedContextImportState = z.infer<typeof sharedContextImportStateSchema>;
