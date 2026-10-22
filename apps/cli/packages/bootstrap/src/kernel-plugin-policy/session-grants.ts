// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-policy：会话授权（跨请求的「本次会话都允许」）。
//
// 契约依据：specs/contracts/kernel-plugin-policy/behavior.md B8、interface.md §三、
//           known-differences.md K7。
//
// 为什么需要它（README §二 c）：`dsh-user-approval` 的 approval **只对那一次请求有效**
// （README 原文：「an approval applies only to that request」）。
// 而 Knorvia 有会话级持久授权（旧实现 `PermissionService.grantSessionPermission`）。
// 所以跨请求的授权状态必须由本包持有。
//
// **有意不持久化**（K7）：DSH session log 才是权威；进程重启 = 新会话，
// 会话授权自然失效 —— 与旧实现的「ephemeral grant set」语义一致。

import {
  compileRuleContent,
  evaluateRuleContent,
  type RuleContentProgram,
} from "./rule-content.js";

/** 一条会话授权。语义对齐旧实现的 `PermissionUpdate` 的「允许某工具的某内容」。 */
export interface SessionGrant {
  readonly toolName: string;
  /**
   * 规则内容（可选）。语义同项目规则：
   * - 以 `:*` 结尾 → 命令前缀匹配（要求边界字符）
   * - 含 `*` → 通配符匹配
   * - WebFetch 输入且是合法 URL → 整串精确匹配
   * - 其他 → 字面量精确匹配
   *
   * 缺席表示「该工具的全部调用」都授权。
   */
  readonly ruleContent?: string;
}

export interface GrantMatchInput {
  readonly toolName: string;
  readonly arguments: unknown;
}

export interface SessionGrantStore {
  /** 该 session 是否有任一 grant 命中本次调用。 */
  matches(sessionId: string, input: GrantMatchInput): boolean;
  /** 追加一条 grant（**集合语义**：重复追加不叠加、不报错）。 */
  add(sessionId: string, grant: SessionGrant): void;
  /** session 结束时清理。 */
  clear(sessionId: string): void;
  /** 只读快照（测试与诊断用）。 */
  snapshot(sessionId: string): readonly SessionGrant[];
  /** 当前有授权的 session 数（诊断用）。 */
  size(): number;
}

export interface SessionGrantStoreConfig {
  /**
   * 外部权威读取器（可选）。返回 `undefined` 等同于空集。
   * 存在时 `matches` 会先查内部集合、再查外部；两者取并集语义。
   */
  readonly readSessionGrants?: (sessionId: string) => readonly SessionGrant[] | undefined;
}

/** 从工具 arguments 里取用于规则匹配的主体串。 */
export function selectGrantSubject(
  input: GrantMatchInput,
): { value: string; isWebFetch: boolean } | undefined {
  const raw = input.arguments;
  if (typeof raw === "string") return { value: raw, isWebFetch: false };
  if (raw === null || typeof raw !== "object") return undefined;
  const fields = raw as Record<string, unknown>;

  // WebFetch 优先取 url：它的规则内容是整串 URL（与旧实现的 selectInput 同序）。
  if (input.toolName === WEB_FETCH_TOOL) {
    const url = fields.url;
    if (typeof url === "string") return { value: url, isWebFetch: true };
  }
  for (const field of GRANT_SUBJECT_FIELDS) {
    const value = fields[field];
    if (typeof value === "string") return { value, isWebFetch: false };
  }
  return undefined;
}

const WEB_FETCH_TOOL = "WebFetch";

/**
 * 主体字段取值顺序。
 *
 * 与旧实现的 `INPUT_FIELDS` 一致：`command` 在最前（Bash 的命令前缀匹配依赖它），
 * 然后是路径、glob 模式与补丁正文。
 */
const GRANT_SUBJECT_FIELDS: readonly string[] = [
  "command",
  "url",
  "file_path",
  "path",
  "pattern",
  "patch_text",
];

/** 判断一条 grant 是否命中。 */
function grantMatches(grant: SessionGrant, input: GrantMatchInput): boolean {
  if (grant.toolName !== input.toolName) return false;
  // 无 ruleContent = 该工具全部调用都授权。
  if (grant.ruleContent === undefined) return true;

  const subject = selectGrantSubject(input);
  // 有 ruleContent 但拿不到主体串 → 不算命中（宁可不放行）。
  if (subject === undefined) return false;

  const program = compileRuleContent(grant.ruleContent, subject.isWebFetch);
  // URL 类规则按整串比较；其他类别按（可能多值的）主体比较。
  const targets = program.kind === "url" ? [subject.value] : [subject.value];
  return targets.some((target) => evaluateRuleContent(program, target));
}

/**
 * 创建会话授权存储。
 *
 * **并发安全**：内部是 `Map<sessionId, SessionGrant[]>`，`add` 是「读—改—写」，
 * 但因为 JS 单线程且 `add` 内部没有任何 `await`，所以不存在半更新状态（B8/L7）。
 */
export function createSessionGrantStore(config: SessionGrantStoreConfig = {}): SessionGrantStore {
  const grants = new Map<string, SessionGrant[]>();

  const internalOf = (sessionId: string): SessionGrant[] => {
    const existing = grants.get(sessionId);
    if (existing !== undefined) return existing;
    const created: SessionGrant[] = [];
    grants.set(sessionId, created);
    return created;
  };

  return {
    matches(sessionId, input) {
      const internal = grants.get(sessionId);
      if (internal !== undefined && internal.some((grant) => grantMatches(grant, input))) {
        return true;
      }
      const external = config.readSessionGrants?.(sessionId);
      if (external === undefined) return false;
      return external.some((grant) => grantMatches(grant, input));
    },
    add(sessionId, grant) {
      const list = internalOf(sessionId);
      // 集合语义：同 toolName + 同 ruleContent 视为同一条，重复追加不产生新条目。
      const duplicate = list.some(
        (item) => item.toolName === grant.toolName && item.ruleContent === grant.ruleContent,
      );
      if (duplicate) return;
      list.push(Object.freeze({ toolName: grant.toolName, ruleContent: grant.ruleContent }));
    },
    clear(sessionId) {
      grants.delete(sessionId);
    },
    snapshot(sessionId) {
      const internal = grants.get(sessionId) ?? [];
      const external = config.readSessionGrants?.(sessionId) ?? [];
      return [...internal, ...external];
    },
    size() {
      return grants.size;
    },
  };
}

export type { RuleContentProgram };
