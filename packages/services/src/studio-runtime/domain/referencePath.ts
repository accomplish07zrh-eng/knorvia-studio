/**
 * 引用路径与身份 key 的纯规则。
 *
 * 与 `reference.ts` 的解析流程分开，既让「路径是否可接受」可以单独测试，
 * 也让两个文件都留在架构策略的行数上限内。本文件**不依赖** `reference.ts`。
 */

/**
 * 拒绝理由。刻意细分为互不重叠的类别，便于 UI 给出不同文案与处理建议。
 */
export type StudioReferenceReason =
  /** 结构非法（缺字段、类型不对、超长）。 */
  | "malformed"
  /** 绝对路径或盘符：无法限定在本次运行的工作区里。 */
  | "absolute-path"
  /** `..`、空段或 `.` 段：试图离开声明的范围。 */
  | "traversal"
  /** ADS、反斜杠、尾随点/空格、保留设备名：会别名到另一个文件。 */
  | "dangerous-name"
  /** 引用的工作区身份与当前运行不一致。 */
  | "workspace-mismatch"
  /** 引用属于另一个运行。 */
  | "foreign-task"
  /** 引用由非前置（后继、旁支或未知）步骤产出。 */
  | "foreign-step"
  /** 引用超出了当前节点可见的范围。 */
  | "scope"
  /** 目标不存在。 */
  | "missing"
  /** 目标存在但版本已变化。 */
  | "changed"
  /** 引用契约版本高于本进程。 */
  | "unsupported-version";

const RESERVED_SEGMENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const PATH_LIMIT = 1024;

/** 身份 key 的唯一来源：`workspaceIdentity?.trim() || workspacePath`。 */
export function studioReferenceIdentity(
  workspaceIdentity?: string | null,
  workspacePath?: string | null,
): string {
  const identity = typeof workspaceIdentity === "string" ? workspaceIdentity.trim() : "";
  if (identity) return identity;
  return typeof workspacePath === "string" ? workspacePath.trim() : "";
}

/**
 * 把路径问题分类到具体理由。
 * 返回 `undefined` 表示该路径段层面可接受（仍需结构校验兜底）。
 */
export function studioReferencePathReason(value: unknown): StudioReferenceReason | undefined {
  if (typeof value !== "string" || !value || value.length > PATH_LIMIT) return "malformed";
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes("\\")
  )
    return "absolute-path";
  if (value.includes("\0")) return "dangerous-name";
  const segments = value.split("/");
  if (segments.some((segment) => segment === "." || segment === "")) return "traversal";
  if (segments.some((segment) => segment === "..")) return "traversal";
  if (segments.some((segment) => segment.includes(":") || /[. ]$/u.test(segment)))
    return "dangerous-name";
  if (segments.some((segment) => RESERVED_SEGMENT.test(segment))) return "dangerous-name";
  return undefined;
}

/** 路径类拒绝理由对应的可读说明。 */
export function studioReferencePathDetail(reason: StudioReferenceReason, value: string): string {
  switch (reason) {
    case "absolute-path":
      return `Reference path must stay inside the run workspace: ${value}`;
    case "traversal":
      return `Reference path escapes its declared scope: ${value}`;
    case "dangerous-name":
      return `Reference path is not a portable file name: ${value}`;
    default:
      return `Invalid reference path: ${value}`;
  }
}
