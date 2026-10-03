// SPDX-License-Identifier: Apache-2.0
// Modified for Knorvia Studio: B2 citation text edit plans, 2026-09-30.
// Prior source was reviewed; authorship/license review remains pending.
import type { Plugin } from "unified";
import {
  resolveAssistantRawFilePath,
  type AssistantFilePathResolveOptions,
} from "@/lib/assistantFileReferences.js";
import { getPathLeaf } from "@/lib/path.js";
import { extractKnorviaFileCitations } from "@/lib/fileCitation.js";

interface CitationMarkdownNode {
  children?: CitationMarkdownNode[];
  type: string;
  url?: string;
  value?: string;
}

interface CitationTextEdit {
  start: number;
  end: number;
  href: string;
  label: string;
}

const protectedSubtrees = new Set(["code", "html", "image", "inlineCode", "link"]);
const insertionBatchSize = 8_192;

function textEdits(
  value: string,
  workspacePath: string,
  options: AssistantFilePathResolveOptions,
): CitationTextEdit[] {
  const edits: CitationTextEdit[] = [];
  for (const citation of extractKnorviaFileCitations(value)) {
    const resolvedPath = resolveAssistantRawFilePath(workspacePath, citation.path, options);
    if (resolvedPath) {
      edits.push({
        start: citation.start,
        end: citation.end,
        href: citation.path,
        label: getPathLeaf(resolvedPath) || citation.path,
      });
    }
  }
  return edits;
}

function applyTextEdits(value: string, edits: CitationTextEdit[]): CitationMarkdownNode[] | null {
  if (!edits.length) return null;
  const pieces: CitationMarkdownNode[] = [];
  let consumed = 0;
  for (const edit of edits) {
    if (edit.start > consumed)
      pieces.push({ type: "text", value: value.slice(consumed, edit.start) });
    // href 保留原 path，label 只生成 text；安全过滤仍由现有 rehype 管线负责。
    pieces.push({ type: "link", url: edit.href, children: [{ type: "text", value: edit.label }] });
    consumed = edit.end;
  }
  if (consumed < value.length) pieces.push({ type: "text", value: value.slice(consumed) });
  return pieces;
}

function projectTree(
  parent: CitationMarkdownNode,
  workspacePath: string,
  options: AssistantFilePathResolveOptions,
): void {
  if (!parent.children || protectedSubtrees.has(parent.type)) return;
  let index = 0;
  while (index < parent.children.length) {
    const child = parent.children[index]!;
    if (child.type !== "text") {
      projectTree(child, workspacePath, options);
      index++;
      continue;
    }
    const value = child.value ?? "";
    const pieces = applyTextEdits(value, textEdits(value, workspacePath, options));
    if (!pieces) {
      index++;
      continue;
    }
    // 仅提交当前 text node；后续 sibling 抛错不撤回已完成替换，也不重访新 link。
    // 大 text node 可生成十万以上节点；分批插入避免引擎参数上限，仍保留原 children 身份与顺序。
    for (let offset = 0; offset < pieces.length; offset += insertionBatchSize) {
      parent.children.splice(
        index + offset,
        offset === 0 ? 1 : 0,
        ...pieces.slice(offset, offset + insertionBatchSize),
      );
    }
    index += pieces.length;
  }
}

export function createKnorviaFileCitationRemarkPlugin(
  workspacePath: string,
  homePath?: string,
): Plugin {
  return function fileCitationRemarkPlugin() {
    return (tree: unknown) => {
      projectTree(tree as CitationMarkdownNode, workspacePath, { homePath });
    };
  };
}
