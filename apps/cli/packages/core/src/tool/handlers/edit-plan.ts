// Pure edit admission and content planning; specs/knorvia-edit-transaction.md.
// Source exposure remains recorded; no independent licence grant is implied.
import { EditErrorCode, type FileSystemReadTextResult } from "@knorvia/contracts";
import type { ReadFileStateMap, ToolHandlerFailure } from "../types.js";
import { findEditableReadFileState } from "../read-file-state.js";
import {
  findEditMatch,
  normalizeLineEndings,
  normalizeReplacementForMatch,
  preserveQuoteStyle,
} from "../edit-matchers.js";

export const editFailure = (errorCode: number, message: string): ToolHandlerFailure => ({
  result: false,
  errorCode,
  message,
});
export type EditPlan = {
  original: string;
  search: string;
  replacement: string;
  content: string;
  strategy?: string;
  candidates?: number;
  attempts: number;
};

function readAdmission(
  path: string,
  read: FileSystemReadTextResult,
  states?: ReadFileStateMap,
): ToolHandlerFailure | undefined {
  if (!states) return;
  const snapshot = findEditableReadFileState(states, path);
  if (!snapshot || snapshot.isPartialView)
    return editFailure(
      EditErrorCode.FILE_NOT_READ,
      "File has not been read yet. Read it first before writing to it.",
    );
  const before = snapshot.mtimeMs;
  const now = read.revision?.mtimeMs;
  const sizeChanged = snapshot.sizeBytes !== read.sizeBytes;
  const changed =
    before !== undefined && now !== undefined
      ? Math.floor(now) > Math.floor(before) || sizeChanged
      : (snapshot.sizeBytes !== undefined && sizeChanged) ||
        Boolean(
          snapshot.revisionId && read.revision?.id && snapshot.revisionId !== read.revision.id,
        );
  const fullIdentical =
    (snapshot.offset ?? 1) <= 1 &&
    snapshot.limit === undefined &&
    snapshot.content === read.content;
  if (changed && !fullIdentical)
    return editFailure(
      EditErrorCode.STALE_FILE,
      "File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.",
    );
}

function ambiguous(count: number, search: string): ToolHandlerFailure {
  const message =
    count > 0
      ? `Found ${count} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.\nString: ${search}`
      : "old_string is not unique in the file. Provide more surrounding context or set replace_all to true.";
  return editFailure(EditErrorCode.AMBIGUOUS_REPLACE, message);
}

export function planExistingEdit(input: {
  path: string;
  read: FileSystemReadTextResult;
  states?: ReadFileStateMap;
  oldString: string;
  newString: string;
  replaceAll: boolean;
  match?: typeof findEditMatch;
}): EditPlan | ToolHandlerFailure {
  const original = normalizeLineEndings(input.read.content);
  const requested = normalizeLineEndings(input.newString);
  if (input.oldString === "") {
    if (original.trim() !== "")
      return editFailure(
        EditErrorCode.FILE_EXISTS_NO_OLD_STRING,
        "Cannot create new file - file already exists.",
      );
    return (
      readAdmission(input.path, input.read, input.states) ?? {
        original,
        search: "",
        replacement: requested,
        content: requested,
        attempts: 0,
      }
    );
  }
  if (input.path.endsWith(".ipynb"))
    return editFailure(
      EditErrorCode.NOTEBOOK_FILE,
      "File is a Jupyter Notebook. Use the NotebookEdit to edit this file.",
    );
  const rejected = readAdmission(input.path, input.read, input.states);
  if (rejected) return rejected;
  const normalizedSearch = normalizeLineEndings(input.oldString);
  const match = (input.match ?? findEditMatch)({
    content: original,
    search: normalizedSearch,
    replaceAll: input.replaceAll,
  });
  if (match.status === "not_found")
    return editFailure(
      EditErrorCode.OLD_STRING_NOT_FOUND,
      `String to replace not found in file.\nString: ${input.oldString}`,
    );
  if (match.status === "ambiguous") return ambiguous(match.candidateCount, input.oldString);
  const search = match.actualString;
  // 旧实现对空实际片段以零长度推进，非空文件会同步死循环；空插入边界有 length+1 个。
  // 保留空文件原有插入语义，非空文件明确返回既有歧义错误且不写回。
  if (!input.replaceAll && search === "" && original.length > 0)
    return ambiguous(original.length + 1, input.oldString);
  if (!input.replaceAll) {
    let count = 0;
    let cursor = 0;
    while (cursor < original.length) {
      const next = original.indexOf(search, cursor);
      if (next < 0) break;
      count++;
      cursor = next + search.length;
    }
    if (count > 1) return ambiguous(count, input.oldString);
  }
  const replacement = preserveQuoteStyle(
    normalizedSearch,
    search,
    normalizeReplacementForMatch(match.strategy, requested),
  );
  // 保留既有删除语义：整段删除同时消费紧随其后的换行，而不是留下空白行。
  const removal =
    replacement === "" && !search.endsWith("\n") && original.includes(search + "\n")
      ? search + "\n"
      : search;
  const content = input.replaceAll
    ? original.replaceAll(removal, () => replacement)
    : original.replace(removal, () => replacement);
  return {
    original,
    search,
    replacement,
    content,
    strategy: match.strategy,
    candidates: match.candidateCount,
    attempts: 1,
  };
}
