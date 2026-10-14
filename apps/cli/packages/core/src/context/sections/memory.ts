// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// Memory section：memory 根目录缺席就不出段；在场时给出一份「怎么写 memory」的指引正文。
import type { ContextSection } from "../types.js";
import { contextSectionFromText } from "./section-core.js";

const MEMORY_HEADING = "# Memory";

/** frontmatter 模板与示例正文：整段一次给出，避免逐行拼装。 */
const MEMORY_FRONTMATTER_EXAMPLE =
  "```markdown\n---\nname: <short-kebab-case-slug>\ndescription: <one-line summary — used to decide relevance during recall>\nmetadata:\n  type: user | feedback | project | reference\n---\n\n<the fact; for feedback/project, follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>\n```";

const MEMORY_LINKING_RULE =
  "In the body, link to related memories with `[[name]]`, where `name` is the other memory's `name:` slug. Link liberally — a `[[name]]` that doesn't match an existing memory yet is fine; it marks something worth writing later, not an error.";

const MEMORY_KIND_GUIDE =
  "`user` — who the user is (role, expertise, preferences). `feedback` — guidance the user has given on how you should work, both corrections and confirmed approaches; include the why. `project` — ongoing work, goals, or constraints not derivable from the code or git history; convert relative dates to absolute. `reference` — pointers to external resources (URLs, dashboards, tickets).";

const MEMORY_INDEX_RULE =
  "After writing the file, add a one-line pointer in `MEMORY.md` (`- [Title](file.md) — hook`). `MEMORY.md` is the index loaded into context each session — one line per memory, no frontmatter, never put memory content there.";

const MEMORY_SAVING_RULE =
  "Before saving, check for an existing file that already covers it — update that file rather than creating a duplicate; delete memories that turn out to be wrong. Don't save what the repo already records (code structure, past fixes, git history, AGENTS.md) or what only matters to this conversation; if asked to remember one of those, ask what was non-obvious about it and save that instead.";

/** 开场句带 memory 根目录插值，用函数包一层以便在装配处内联。 */
function memoryIntroLine(memoryRoot: string): string {
  return `You have a persistent file-based memory at \`${memoryRoot}/\`. This directory already exists — write to it directly with the Write tool (do not run mkdir or check for its existence). Each memory is one file holding one fact, with frontmatter:`;
}

export const buildMemorySection = (memoryRoot: string | undefined): ContextSection | null => {
  const root = memoryRoot ?? "";
  if (root === "") return null;
  const blocks = [
    MEMORY_HEADING,
    memoryIntroLine(root),
    MEMORY_FRONTMATTER_EXAMPLE,
    MEMORY_LINKING_RULE,
    MEMORY_KIND_GUIDE,
    MEMORY_INDEX_RULE,
    MEMORY_SAVING_RULE,
  ];
  return contextSectionFromText("Memory", "memory", "system", "dynamic", blocks.join("\n\n"));
};
