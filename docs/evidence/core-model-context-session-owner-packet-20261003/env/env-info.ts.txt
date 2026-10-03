import type { ContextSection, EnvInfo } from "../types.js";
import type { Model } from "@knorvia/contracts";
import { estimateTokens } from "../utils.js";

const GIT_SYSTEM_CONTEXT_PREFIX =
  "gitStatus: This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.";

function createSection(
  name: string,
  source: ContextSection["source"],
  content: string,
): ContextSection {
  return {
    name,
    source,
    injectionTarget: "system",
    cacheHint: "dynamic",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}

export function isEnvInfoGitRepository(info: EnvInfo): boolean {
  return (
    info.isGitRepository ??
    (info.gitStatus !== undefined
      ? info.gitStatus !== "not_repo"
      : Boolean(info.gitBranch))
  );
}

export function buildEnvInfoSection(
  envInfo: EnvInfo,
  model?: Model,
): ContextSection {
  const hasGitRepository = isEnvInfoGitRepository(envInfo);
  const lines = [
    "# Environment",
    "You have been invoked in the following environment:",
    `- Primary working directory: ${envInfo.cwd}`,
    `- Is a git repository: ${hasGitRepository ? "yes" : "no"}`,
    `- Platform: ${envInfo.platform}`,
    `- Shell: ${envInfo.shell}`,
    `- OS Version: ${envInfo.osVersion}`,
  ];
  if (model) {
    lines.push(
      `- You are powered by the model named ${model.providerId}/${model.modelId}.`,
    );
  }
  return createSection("Environment Info", "env_info", lines.join("\n"));
}

function formatStatus(info: EnvInfo): string {
  if (info.gitStatusLines && info.gitStatusLines.length > 0) {
    return info.gitStatusLines.join("\n");
  }
  if (info.gitStatus === "dirty") return "(dirty)";
  if (info.gitStatus === "clean") return "(clean)";
  return "(unknown)";
}

function formatCommits(info: EnvInfo): string {
  if (info.recentCommits && info.recentCommits.length > 0) {
    return info.recentCommits.join("\n");
  }
  return "";
}

export function buildGitSystemContextSection(
  envInfo: EnvInfo,
): ContextSection | null {
  if (!isEnvInfoGitRepository(envInfo)) return null;

  const lines = [GIT_SYSTEM_CONTEXT_PREFIX];
  if (envInfo.gitBranch) {
    lines.push("", `Current branch: ${envInfo.gitBranch}`);
  }
  if (envInfo.gitMainBranch) {
    lines.push(
      "",
      `Main branch (you will usually use this for PRs): ${envInfo.gitMainBranch}`,
    );
  }
  if (envInfo.gitUser) {
    lines.push("", `Git user: ${envInfo.gitUser}`);
  }
  lines.push(
    "",
    `Status:\n${formatStatus(envInfo)}`,
    "",
    `Recent commits:\n${formatCommits(envInfo)}`,
  );
  return createSection("System Context", "system_context", lines.join("\n"));
}
