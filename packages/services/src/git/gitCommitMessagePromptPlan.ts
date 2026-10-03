// Source-exposed contribution: new lazy row/window and ordered block structure.
// Prompt prose, limits, path/summary formatting and clipping syntax remain retained.
import type {
  GitCommitMessageConversationContext,
  GitDiffResult,
  GitFileChange,
  Locale,
} from "@knorvia/shared";

interface PromptInput {
  branchName: string | null;
  locale?: Locale;
  files: readonly GitFileChange[];
  diffs: readonly GitDiffResult[];
  conversationContext?: GitCommitMessageConversationContext;
}

interface ExcerptRow {
  render(remaining: number): string;
  charge(rendered: string): number;
}

// Preflight before budget inspection is deliberate: legacy prompt failures on
// the first exhausted row must still be observed. Empty rows skip that inspection.
function compileExcerptWindow<T>(
  inputs: readonly T[],
  budget: number,
  prepare: (input: T) => ExcerptRow | null,
): string[] {
  const output: string[] = [];
  let used = 0;
  for (const input of inputs) {
    const row = prepare(input);
    if (!row) continue;
    const remaining = budget - used;
    if (remaining <= 0) break;
    const rendered = row.render(remaining);
    output.push(rendered);
    used += row.charge(rendered);
  }
  return output;
}

const RETAINED_INSTRUCTIONS = [
  "Write exactly one Git commit message for the workspace changes below.",
  "Return only the commit message text.",
  "",
  "Hard requirements:",
  "- The first line must be a valid Conventional Commit subject.",
  "- Use one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.",
  "- Keep the Conventional Commit type and optional scope in English.",
  "- Write the subject and any body in the current language.",
  "- Keep the subject under 72 characters.",
  "- Use the current session conversation context only to infer user intent.",
  "- Do not mention the conversation, chat, prompt, or user request explicitly.",
  "- Do not explain your reasoning.",
  "- Do not repeat these instructions.",
];

export function assembleGitCommitMessagePrompt(params: PromptInput): string {
  const branch = params.branchName?.trim() || "(detached or unknown)";
  const language = resolveCommitMessageLanguage(params.locale);
  const visibleFiles = params.files.slice(0, 20);
  const omittedFiles = Math.max(0, params.files.length - visibleFiles.length);
  const fileSummary = visibleFiles
    .map((file) => `- ${file.kind} ${file.repoRelativePath} (+${file.added}/-${file.removed})`)
    .join("\n");
  const diffSummary = diffWindow(params.diffs);
  const conversationSummary = conversationWindow(params.conversationContext);
  const blocks = [
    RETAINED_INSTRUCTIONS,
    ["", `Current branch: ${branch}`, `Current language: ${language}`],
    ["", "Current session conversation context:", conversationSummary || "(not provided)"],
    [
      "",
      "Changed files:",
      fileSummary || "- (no file summary available)",
      omittedFiles > 0 ? `- ... ${omittedFiles} more files` : "",
    ],
    [
      "",
      "Diff excerpts:",
      diffSummary || "(diff unavailable; infer only from the changed file summary)",
    ],
  ];
  return blocks
    .flat()
    .filter((line) => line !== "")
    .join("\n");
}

function diffWindow(diffs: readonly GitDiffResult[]): string {
  return compileExcerptWindow(diffs.slice(0, 8), 12_000, (diff) => {
    const header = `--- ${diff.path}`;
    const body = diff.patch?.trim() || diff.summary?.trim() || "(diff unavailable)";
    return {
      render: (remaining) =>
        `${header}\n${clipText(body, Math.min(2_000, remaining), "...diff truncated...")}`,
      charge: (rendered) => rendered.length,
    };
  }).join("\n\n");
}

function conversationWindow(context: GitCommitMessageConversationContext | undefined): string {
  const messages = context?.messages ?? [];
  if (messages.length === 0) return "";
  const omitted = (context?.omittedMessageCount ?? 0) + Math.max(0, messages.length - 12);
  const prefix = omitted > 0 ? [`- ${omitted} earlier messages omitted`] : [];
  const chunks = compileExcerptWindow(messages.slice(-12), 4_000, (message) => {
    const content = normalizeConversationContextText(message.content);
    if (!content) return null;
    const role = message.role === "assistant" ? "Assistant" : "User";
    const clipped = clipText(content, 600, "...message truncated...");
    const row = `${role}: ${clipped}`;
    return {
      render: (remaining) => clipText(row, remaining, "...conversation truncated..."),
      charge: (rendered) => rendered.length + 1,
    };
  });
  return [...prefix, ...chunks].join("\n");
}

function resolveCommitMessageLanguage(locale?: Locale): "Chinese" | "English" {
  const candidate = locale ?? readRuntimeLocale();
  return candidate?.toLowerCase().startsWith("zh") ? "Chinese" : "English";
}

function readRuntimeLocale(): string | undefined {
  try {
    // 系统默认语言没有从 UI 显式传入时，服务层只能读取当前运行时的 Intl locale。
    // 这里仍只接受 zh 为中文，其它未知或读取失败都按英文处理，避免误生成第三种语言。
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

function normalizeConversationContextText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function clipText(value: string, maxChars: number, marker: string): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - marker.length - 1)).trimEnd()}\n${marker}`;
}
