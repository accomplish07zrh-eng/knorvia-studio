// Orchestration through the existing filesystem port; no additional IO or retries.
import {
  EditInputSchema,
  EditErrorCode,
  isFileSystemPortError,
  type EditInput,
  type FileSystemStatResult,
} from "@knorvia/contracts";
import type { ToolHandler } from "../types.js";
import { resolveWorkspacePath } from "../path-policy.js";
import { findReadFileSuggestion } from "./read-file-suggestion.js";
import { editFailure, planExistingEdit } from "./edit-plan.js";
import { commitEdit, editTrace, requireEditPort } from "./edit-commit.js";
import { findEditMatch } from "../edit-matchers.js";
import { elapsedMsSince } from "./tool-perf.js";

const MAX_EDIT_BYTES = 1024 ** 3;
export const executeEdit: ToolHandler = async (input, context) => {
  const request = EditInputSchema.parse(input) as EditInput;
  const port = requireEditPort(context);
  if (request.old_string === request.new_string)
    return editFailure(
      EditErrorCode.NO_CHANGE,
      "No changes to make: old_string and new_string are exactly the same.",
    );
  if (!request.file_path)
    return editFailure(EditErrorCode.INVALID_PATH, "Tool path must not be empty");
  const path = resolveWorkspacePath({
    inputPath: request.file_path,
    operation: "write",
    workingDirectory: context.workingDirectory,
    workspaceRoot: context.workspaceRoot,
  });
  let stat: FileSystemStatResult | null;
  try {
    stat = await port.stat({ path, trace: editTrace(context) }, { signal: context.abortSignal });
  } catch (error) {
    if (!isFileSystemPortError(error) || error.code !== "not_found") throw error;
    stat = null;
  }
  const common = { context, path, inputPath: request.file_path, replaceAll: request.replace_all };
  if (!stat) {
    if (request.old_string === "")
      return commitEdit({
        ...common,
        plan: {
          original: "",
          search: "",
          replacement: request.new_string,
          content: request.new_string,
          attempts: 0,
        },
        readMs: 0,
        matchMs: 0,
      });
    const suggestion = await findReadFileSuggestion(path, context);
    return editFailure(
      EditErrorCode.FILE_NOT_EXIST,
      `File does not exist. Note: your current working directory is ${context.workingDirectory}.${suggestion ? ` Did you mean ${suggestion}?` : ""}`,
    );
  }
  if (stat.sizeBytes > MAX_EDIT_BYTES)
    return editFailure(
      EditErrorCode.FILE_TOO_LARGE,
      "File is too large to edit (1GB). Maximum editable file size is 1GB.",
    );
  const readStarted = Date.now();
  const read = await port.readTextFile(
    { path, trace: editTrace(context) },
    { signal: context.abortSignal },
  );
  const readMs = elapsedMsSince(readStarted);
  let matchMs = 0;
  const plan = planExistingEdit({
    path,
    read,
    states: context.readFileState,
    oldString: request.old_string,
    newString: request.new_string,
    replaceAll: request.replace_all,
    match: (query) => {
      const started = Date.now();
      const matched = findEditMatch(query);
      matchMs = elapsedMsSince(started);
      return matched;
    },
  });
  if ("result" in plan) return plan;
  return commitEdit({
    ...common,
    plan,
    read,
    readMs,
    matchMs,
  });
};
