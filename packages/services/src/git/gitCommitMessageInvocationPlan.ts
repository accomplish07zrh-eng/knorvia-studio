// One local two-effect protocol; the existing generator alone executes model IO.
import type {
  GitCommitMessageConversationContext,
  GitDiffResult,
  GitFileChange,
  Locale,
  KnorviaWorkspaceGenerateTextParams,
} from "@knorvia/shared";
import { assembleGitCommitMessagePrompt } from "./gitCommitMessagePromptPlan.js";
import { interpretGitCommitMessageResponse } from "./gitCommitMessageResponsePlan.js";
type Selection = KnorviaWorkspaceGenerateTextParams["selection"];
interface Input {
  workspacePath: string;
  workspaceIdentity?: string;
  branchName: string | null;
  locale?: Locale;
  files: readonly GitFileChange[];
  diffs: readonly GitDiffResult[];
  conversationContext?: GitCommitMessageConversationContext;
}
type Effect =
  | { kind: "select" }
  | {
      kind: "complete";
      request: {
        workspacePath: string;
        workspaceIdentity?: string;
        selection: Selection;
        prompt: string;
      };
    };
interface Events {
  started(selection: Selection): void;
  rejected(
    selection: Selection,
    validation: Extract<ReturnType<typeof interpretGitCommitMessageResponse>, { ok: false }>,
  ): never;
}

export function* planGitCommitMessageInvocation(
  params: Input,
  events: Events,
): Generator<Effect, { message: string; providerId: string; model: string }, Selection | string> {
  const selection = (yield { kind: "select" }) as Selection;
  const prompt = assembleGitCommitMessagePrompt({
    branchName: params.branchName,
    locale: params.locale,
    files: params.files,
    diffs: params.diffs,
    conversationContext: params.conversationContext,
  });
  events.started(selection);
  const raw = (yield {
    kind: "complete",
    request: {
      workspacePath: params.workspacePath,
      workspaceIdentity: params.workspaceIdentity,
      selection,
      prompt,
    },
  }) as string;
  const validation = interpretGitCommitMessageResponse(raw);
  if (!validation.ok) events.rejected(selection, validation);
  return {
    message: validation.message,
    providerId: selection.providerId,
    model: selection.modelId,
  };
}
