// SPDX-License-Identifier: Apache-2.0
import type { RemoteTarget } from "./remoteTarget.js";

import type { TelemetryEventPayload } from "./telemetry.js";

import {
  parseRemoteWorkspaceIdentity,
  type RemoteWorkspaceIdentityKind,
} from "./remote-workspace-identity.js";

const ERROR_CATEGORIES = [
  "auth",
  "connect",
  "deploy",
  "host_start",
  "attach",
  "relay",
  "unknown",
] as const;

export type RemoteUsageErrorCategory = (typeof ERROR_CATEGORIES)[number];

export type RemoteUsageRemoteKind = RemoteTarget["kind"];

type WorkspaceKind = "local" | "remote";

export type RemoteUsageWorkspaceKind = WorkspaceKind;

export type RemoteUsageResult = "success" | "failure";

export type RemoteWorkspaceConnectTrigger = "new" | "reconnect" | "restore";

type UsageScope = {
  workspaceIdentity?: string | null;
  remoteSessionId?: string | null;
};

type WorkspaceDetail = {
  workspace_kind: WorkspaceKind;
  remote_kind: RemoteWorkspaceIdentityKind | "";
};

type ConnectResultFields = {
  result: RemoteUsageResult;
  remoteKind: RemoteUsageRemoteKind;
  connectTrigger: RemoteWorkspaceConnectTrigger;
};

type ConnectResultInput = ConnectResultFields & {
  errorCategory?: RemoteUsageErrorCategory;
};

/** 空串与纯空白等同「未提供」；远端会话 ID 或远程身份键任一存在即视为远端。 */
const present = (value: string | null | undefined): string => (value ?? "").trim();

export const resolveWorkspaceTelemetryDetail = (scope: UsageScope): WorkspaceDetail => {
  const identity = present(scope.workspaceIdentity);
  const sessionId = present(scope.remoteSessionId);
  const isRemote = identity.length > 0 || sessionId.length > 0;
  const parsed = identity.length > 0 ? parseRemoteWorkspaceIdentity(identity) : null;
  return { workspace_kind: isRemote ? "remote" : "local", remote_kind: parsed?.kind ?? "" };
};

export const buildRemoteWorkspaceConnectResultTelemetry = (
  input: ConnectResultInput,
): TelemetryEventPayload => {
  const succeeded = input.result === "success";
  // 成功时错误分类没有意义，固定为空串；失败且未分类时给 unknown 而不是空。
  const errorCategory = succeeded ? "" : (input.errorCategory ?? "unknown");
  const detail = {
    result: input.result,
    remote_kind: input.remoteKind,
    connect_trigger: input.connectTrigger,
    error_category: errorCategory,
  };
  const envelope = {
    elementName: "remote_workspace_connect_result",
    eventRegion: "remote_workspace",
    eventType: "result",
    eventExtraDetail: detail,
  } satisfies TelemetryEventPayload;
  return envelope;
};

/** 把任意错误形态压平成小写文本；分类只看文本内容，不重新抛错。 */
function errorText(error: unknown): string {
  if (typeof error === "string") return error.toLowerCase();
  if (typeof error !== "object" || error === null) return "";
  const record = error as Record<string, unknown>;
  const parts = [record.code, record.message, record.name, record.error, record.detail];
  const presentParts = parts.filter((part) => part !== undefined && part !== null);
  return presentParts
    .map((part) => String(part))
    .join(" ")
    .toLowerCase();
}

/* 分类表按「先命中先返回」排列：auth 最具体，connect 最宽泛，必须放在最后兜底。 */
type CategoryRule = { category: RemoteUsageErrorCategory; pattern: RegExp };

const CATEGORY_RULES: readonly CategoryRule[] = [
  { category: "auth", pattern: /(?:auth|password|credential|token|permission|denied|unauthor)/ },
  { category: "deploy", pattern: /(?:deploy|download|install|asset|checksum)/ },
  {
    category: "host_start",
    pattern: /(?:host_start|host start|spawn|process.*(?:exit|start)|host.*(?:exit|start))/,
  },
  {
    category: "attach",
    pattern:
      /(?:attach|desktop_host_missing|workspace.*(?:identity|missing|mismatch)|remote_session)/,
  },
  {
    category: "relay",
    pattern: /(?:relay|websocket|web socket|pair|device.*(?:kicked|not.found))/,
  },
  {
    category: "connect",
    pattern: /(?:connect|network|socket|ssh|wsl|docker|server|timeout|timedout|econn)/,
  },
];

export const classifyRemoteUsageError = (error: unknown): RemoteUsageErrorCategory => {
  const text = errorText(error);
  const hit = CATEGORY_RULES.find((rule) => rule.pattern.test(text));
  return hit?.category ?? "unknown";
};
