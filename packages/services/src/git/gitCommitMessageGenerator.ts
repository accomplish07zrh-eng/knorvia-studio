// Source-exposed generator: invocation control is newly structured; public declarations,
// lookup/request/error routines, logging syntax and prompts retain compatibility content.
import type {
  GitCommitMessageConversationContext,
  GitDiffResult,
  GitFileChange,
  Locale,
  KnorviaWorkspaceGenerateTextParams,
} from "@knorvia/shared";
import type { ServiceLogger } from "#src/logger/serviceLogger.js";
import { planGitCommitMessageInvocation } from "./gitCommitMessageInvocationPlan.js";

const COMMIT_MESSAGE_QUERY_SOURCE = "git_commit_message";

interface GitCommitMessageCurrentModelProvider {
  readCurrentModel(params: {
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<KnorviaWorkspaceGenerateTextParams["selection"] | null>;
}

interface GitCommitMessageTextGenerator {
  generateText(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    selection: KnorviaWorkspaceGenerateTextParams["selection"];
    prompt: string;
    querySource: string;
  }): Promise<{ text: string; selection: KnorviaWorkspaceGenerateTextParams["selection"] }>;
}

interface GitCommitMessageGeneratorOptions {
  currentModelProvider: GitCommitMessageCurrentModelProvider;
  textGenerator: GitCommitMessageTextGenerator;
  logger?: ServiceLogger;
}

class GitCommitMessageGenerationError extends Error {
  constructor(
    message: string,
    readonly reason: "model-unavailable" | "request-failed" | "invalid-output",
    readonly detail?: string,
  ) {
    super(message);
    this.name = "GitCommitMessageGenerationError";
  }
}

export class GitCommitMessageGenerator {
  constructor(private readonly options: GitCommitMessageGeneratorOptions) {}

  async generate(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    branchName: string | null;
    locale?: Locale;
    files: readonly GitFileChange[];
    diffs: readonly GitDiffResult[];
    conversationContext?: GitCommitMessageConversationContext;
  }): Promise<{ message: string; providerId: string; model: string }> {
    const invocation = planGitCommitMessageInvocation(params, {
      started: (selection) => {
        this.options.logger?.info(undefined, "开始生成 Git 提交消息", {
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
          providerId: selection.providerId,
          model: selection.modelId,
          fileCount: params.files.length,
          diffCount: params.diffs.length,
          conversationMessageCount: params.conversationContext?.messages.length ?? 0,
          conversationOmittedMessageCount: params.conversationContext?.omittedMessageCount ?? 0,
        });
      },
      rejected: (selection, validation) => {
        // 模型可能重复 prompt 或返回解释性长文本，直接塞给 UI 会让错误提示失控。
        // 这里只保留短 preview 给用户，完整模型调用细节由 agent runtime 的模型日志记录。
        this.options.logger?.debug(undefined, "模型生成的 Git 提交消息不合规", {
          workspacePath: params.workspacePath,
          providerId: selection.providerId,
          model: selection.modelId,
          reason: validation.reason,
          preview: validation.preview,
        });
        throw new GitCommitMessageGenerationError(
          "模型没有返回可用的 Conventional Commit 提交消息。",
          "invalid-output",
          validation.preview,
        );
      },
    });
    let step = invocation.next();
    for (;;) {
      if (step.done === true) return step.value;
      const effect = step.value;
      const response =
        effect.kind === "select"
          ? await this.resolveCurrentModel(params)
          : await this.complete(effect.request);
      step = invocation.next(response);
    }
  }

  private async resolveCurrentModel(params: {
    workspacePath: string;
    workspaceIdentity?: string;
  }): Promise<KnorviaWorkspaceGenerateTextParams["selection"]> {
    const currentModel = await this.options.currentModelProvider.readCurrentModel({
      workspacePath: params.workspacePath,
      workspaceIdentity: params.workspaceIdentity,
    });
    const modelId = currentModel?.modelId?.trim();
    const providerId = currentModel?.providerId?.trim();
    const options = currentModel?.options;
    if (!providerId || !modelId) {
      throw new GitCommitMessageGenerationError("未读取到当前模型。", "model-unavailable");
    }
    return {
      providerId,
      modelId,
      ...(options
        ? {
            options: {
              ...options,
            },
          }
        : {}),
    };
  }

  private async complete(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    selection: KnorviaWorkspaceGenerateTextParams["selection"];
    prompt: string;
  }): Promise<string> {
    try {
      const result = await this.options.textGenerator.generateText({
        workspacePath: params.workspacePath,
        ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
        selection: params.selection,
        prompt: params.prompt,
        querySource: COMMIT_MESSAGE_QUERY_SOURCE,
      });
      return normalizeModelText(result.text);
    } catch (error) {
      if (error instanceof GitCommitMessageGenerationError) {
        throw error;
      }
      throw new GitCommitMessageGenerationError(
        "模型请求失败。",
        "request-failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

function normalizeModelText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("模型响应缺少文本内容。");
  }
  return value.trim();
}
