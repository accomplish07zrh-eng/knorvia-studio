// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 环境信息与 git 系统上下文两个 section：前者总是产出，后者只在 git 仓库里产出。
import type { EnvInfo } from "../types.js";
import type { ContextSection } from "../types.js";
import type { Model } from "@knorvia/contracts";
import { contextSectionFromText } from "./section-core.js";

const ENV_TITLE = "# Environment";

const ENV_INTRO = "You have been invoked in the following environment:";

const GIT_STATUS_SNAPSHOT_PREFIX =
  "gitStatus: This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.";

/** 状态字面量到展示文本的登记表；没有登记也没有显式行时回落到 (unknown)。 */
const STATUS_LABELS: Record<string, string> = { clean: "(clean)", dirty: "(dirty)" };

/** 统一的 `- 标签: 值` 行，避免把取值逻辑写成模板串。 */
function labelledLine(label: string, value: unknown): string {
  return `- ${label}: ${value}`;
}

/** 带命名空间的 `标签: 值` 行（git 段里不带前导短横线）。 */
function labelledText(label: string, value: string): string {
  return `${label}: ${value}`;
}

export const isEnvInfoGitRepository = (info: EnvInfo): boolean => {
  if (info.isGitRepository != null) return info.isGitRepository;
  if (info.gitStatus !== undefined) return info.gitStatus !== "not_repo";
  return Boolean(info.gitBranch);
};

export const buildEnvInfoSection = (envInfo: EnvInfo, model?: Model): ContextSection => {
  const lines = [ENV_TITLE, ENV_INTRO];
  lines.push(labelledLine("Primary working directory", envInfo.cwd));
  lines.push(labelledLine("Is a git repository", isEnvInfoGitRepository(envInfo) ? "yes" : "no"));
  lines.push(labelledLine("Platform", envInfo.platform));
  lines.push(labelledLine("Shell", envInfo.shell));
  lines.push(labelledLine("OS Version", envInfo.osVersion));
  if (model) {
    lines.push(poweredByLine(model));
  }
  return contextSectionFromText(
    "Environment Info",
    "env_info",
    "system",
    "dynamic",
    lines.join("\n"),
  );
};

function poweredByLine(model: Model): string {
  return `- You are powered by the model named ${model.providerId}/${model.modelId}.`;
}

function formatStatus(info: EnvInfo): string {
  const explicit = info.gitStatusLines;
  if (explicit && explicit.length > 0) return explicit.join("\n");
  return STATUS_LABELS[info.gitStatus ?? ""] ?? "(unknown)";
}

function formatCommits(info: EnvInfo): string {
  const commits = info.recentCommits;
  return commits && commits.length > 0 ? commits.join("\n") : "";
}

export const buildGitSystemContextSection = (envInfo: EnvInfo): ContextSection | null => {
  if (!isEnvInfoGitRepository(envInfo)) return null;

  const lines = [GIT_STATUS_SNAPSHOT_PREFIX];
  if (envInfo.gitBranch) {
    lines.push("", labelledText("Current branch", envInfo.gitBranch));
  }
  if (envInfo.gitMainBranch) {
    lines.push(
      "",
      labelledText("Main branch (you will usually use this for PRs)", envInfo.gitMainBranch),
    );
  }
  if (envInfo.gitUser) {
    lines.push("", labelledText("Git user", envInfo.gitUser));
  }
  lines.push(
    "",
    "Status:\n" + formatStatus(envInfo),
    "",
    "Recent commits:\n" + formatCommits(envInfo),
  );
  return contextSectionFromText(
    "System Context",
    "system_context",
    "system",
    "dynamic",
    lines.join("\n"),
  );
};
