// SPDX-License-Identifier: Apache-2.0
// bash 工具的 provider 描述：把超时、后台、专用工具选择与 git 约定写给模型看。
// 文案本身是对外契约的一部分（开头句与 # Git 段被测试锚定），逐字保持。
interface PromptBudget {
  defaultTimeoutMs: number;
  embeddedSearchEnabled?: boolean;
  maxTimeoutMs: number;
}

const OPENING_SENTENCE = "Executes a bash command and returns its output.";
// 有内嵌搜索时，避免清单收窄（find/grep 交给专用工具）。
const DEDICATED_TOOL_HINT_WITH_SEARCH = "`cat`, `head`, `tail`, `sed`, `awk`, or `echo`";
const DEDICATED_TOOL_HINT_FULL = "`find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo`";
const TOOL_SELECTION_TEMPLATE =
  "- IMPORTANT: Avoid using this tool to run ${0} commands, unless explicitly instructed or after you have verified that a dedicated tool cannot accomplish your task. Instead, use the appropriate dedicated tool as this will provide a much better experience for the user.";
const PERSISTENCE_NOTE =
  "- Working directory persists between calls, but prefer absolute paths — `cd` in a compound command can trigger a permission prompt. Shell state (env vars, functions) does not persist; the shell is initialized from the user's profile.";
const TIMEOUT_TEMPLATE = "- `timeout` is in milliseconds: default ${0}, max ${1}.";
const BACKGROUND_NOTE =
  "- `run_in_background` runs the command detached: it keeps running across turns and re-invokes you when it exits. No `&` needed.";
const GIT_SECTION_HEADING = "# Git";
const GIT_NO_INTERACTIVE_NOTE =
  "- Interactive flags (`-i`, e.g. `git rebase -i`, `git add -i`) are not supported in this environment.";
const GIT_HOSTING_NOTE = "- Use the `gh` CLI for GitHub operations (PRs, issues, API).";
const GIT_COMMIT_NOTE =
  "- Commit or push only when the user asks. If on the default branch, branch first.";

export function createBashProviderDescription(budget: PromptBudget): string {
  const avoidList = budget.embeddedSearchEnabled
    ? DEDICATED_TOOL_HINT_WITH_SEARCH
    : DEDICATED_TOOL_HINT_FULL;
  const selectionLine = TOOL_SELECTION_TEMPLATE.replace("${0}", avoidList);
  const timeoutLine = TIMEOUT_TEMPLATE.replace("${0}", String(budget.defaultTimeoutMs)).replace(
    "${1}",
    String(budget.maxTimeoutMs),
  );
  const sections = [
    OPENING_SENTENCE,
    "",
    PERSISTENCE_NOTE,
    selectionLine,
    timeoutLine,
    BACKGROUND_NOTE,
    "",
    GIT_SECTION_HEADING,
    GIT_NO_INTERACTIVE_NOTE,
    GIT_HOSTING_NOTE,
    GIT_COMMIT_NOTE,
  ];
  return sections.join("\n");
}
