import { useRef } from "react";
import { usePlatform } from "../../hooks/usePlatform.js";
import {
  decodeWorkflowFile,
  encodeWorkflowFile,
  WORKFLOW_FILE_LIMIT,
  WorkflowFileError,
  workflowFileName,
} from "./workflowFiles.js";
import { useWorkflowText } from "./useWorkflowText.js";
import type { StudioWorkflow } from "./types.js";

export function useWorkflowFiles() {
  const platform = usePlatform();
  const t = useWorkflowText();
  const input = useRef<HTMLInputElement>(null);
  const read = async (file: File, workspacePath = "") => {
    try {
      if (file.size > WORKFLOW_FILE_LIMIT) throw new WorkflowFileError("fileTooLarge");
      return decodeWorkflowFile(await file.text(), workspacePath);
    } catch (cause) {
      throw new Error(t(cause instanceof WorkflowFileError ? cause.code : "fileInvalid"));
    }
  };
  const save = async (workflow: StudioWorkflow) => {
    let text: string;
    try {
      text = encodeWorkflowFile(workflow);
    } catch (cause) {
      throw new Error(t(cause instanceof WorkflowFileError ? cause.code : "fileInvalid"));
    }
    const suggestedName = workflowFileName(workflow.name);
    const bytes = new TextEncoder().encode(text);
    if (platform.saveFile) {
      const result = await platform.saveFile({ data: bytes.buffer as ArrayBuffer, suggestedName });
      if (result.canceled) return false;
      if (!result.success) throw new Error(result.error || t("exportFailed"));
    } else {
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = suggestedName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // 浏览器在下一个事件循环开始读取 Blob，保留到读取启动之后再释放。
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return true;
  };
  return { input, read, save, open: () => input.current?.click() };
}
