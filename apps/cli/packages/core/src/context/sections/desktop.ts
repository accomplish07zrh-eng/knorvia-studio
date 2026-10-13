// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// Knorvia Studio Desktop 渲染与交互协议 section：注入 system，内容固定。
import type { ContextSection } from "../types.js";
import { contextSectionFromText } from "./section-core.js";

const DESKTOP_TITLE = "# Knorvia Studio Desktop Context";

const DESKTOP_FILES_BLOCK =
  "### Files & URLs\n- Return local web URLs as Markdown links (e.g., [label](http://127.0.0.1:8080)).\n- File should be an absolute path or include the workspace folder segment so it can be resolved relative to the workspace.\n- Unless otherwise specified, return local file references as Markdown links (e.g., [name.md](/absolute/path/to/name.md)).";

const DESKTOP_COMMENTS_BLOCK =
  "### Inline Code Comments\n- Use the ::code-comment{...} directive when you need to attach feedback directly to specific code lines.\n- Emit one directive per inline comment; emit none when there are no actionable inline comments.\n- Required attributes: title (short label), body (one-paragraph explanation), file (path to the file).\n- Optional attributes: start, end (1-based line numbers), priority (0-3).\n- file should be an absolute path or include the workspace folder segment so it can be resolved relative to the workspace.\n- Keep line ranges tight; end defaults to start.";

const DESKTOP_COMMENT_EXAMPLE =
  '- Example: ::code-comment{title="[P2] Off-by-one" body="Loop iterates past the end when length is 0." file="/path/to/foo.ts" start=10 end=11 priority=2}';

export const buildDesktopContextSection = (): ContextSection =>
  contextSectionFromText(
    "Knorvia Studio Desktop Context",
    "desktop_context",
    "system",
    "stable",
    [
      DESKTOP_TITLE,
      "",
      DESKTOP_FILES_BLOCK,
      "",
      DESKTOP_COMMENTS_BLOCK,
      DESKTOP_COMMENT_EXAMPLE,
    ].join("\n"),
  );
