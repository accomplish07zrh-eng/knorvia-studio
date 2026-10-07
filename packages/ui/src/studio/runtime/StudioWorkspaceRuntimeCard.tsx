// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import type {
  StudioWorkspaceRuntimeCommand,
  StudioWorkspaceRuntimeControl,
} from "@knorvia/services";
import { useStudioWorkspaceRuntime } from "@/hooks/useStudioWorkspaceRuntime.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";

export function StudioWorkspaceRuntimeCard({ runId, stepId }: { runId: string; stepId: string }) {
  const [open, setOpen] = useState(false);
  const [executable, setExecutable] = useState("");
  const [args, setArgs] = useState("[]");
  const [error, setError] = useState<string>();
  const runtime = useStudioWorkspaceRuntime(runId, stepId, open);
  const confirm = useConfirmDialog();
  const { intl } = useKnorviaIntl();
  const message = (name: string) => intl.formatMessage({ id: `studio.workspaceRuntime.${name}` });
  const state = runtime.state;
  const running = state && ["preparing", "starting", "ready", "stopping"].includes(state.phase);
  const recovering = state && ["interrupted", "cleanup-required"].includes(state.phase);
  const disabled = runtime.busy || !state?.canControl;
  async function execute(action: "prepare" | "start" | "stop" | "recover") {
    setError(undefined);
    try {
      let control: StudioWorkspaceRuntimeControl;
      if (action === "stop" || action === "recover") control = { action };
      else {
        let command: StudioWorkspaceRuntimeCommand | undefined;
        if (executable.trim()) {
          const argv: unknown = JSON.parse(args);
          if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string"))
            throw new Error(message("invalidArgs"));
          command = { executable: executable.trim(), args: argv };
        } else if (action === "start") throw new Error(message("commandRequired"));
        const accepted = await confirm({
          title: message("confirm"),
          description: `${message("confirmDetail")}\n${state?.workspacePath ?? ""}\n${command ? JSON.stringify(command) : message("skipSetup")}`,
          confirmLabel: message("allowOnce"),
          cancelLabel: message("cancel"),
        });
        if (!accepted) return;
        control =
          action === "prepare"
            ? { action, approved: true, command }
            : { action, approved: true, command: command! };
      }
      await runtime.control(control);
      if (action === "prepare" || action === "start") {
        setExecutable("");
        setArgs("[]");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : message("unavailable"));
    }
  }
  return (
    <details
      className="mt-2 text-ui-sm"
      data-testid="studio-workspace-runtime"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-foreground-subtle">{message("title")}</summary>
      {open && (
        <div className="mt-2 space-y-2">
          <p role="status" data-testid="studio-workspace-runtime-status">
            {state ? message(`phase.${state.phase}`) : message("loading")}
          </p>
          {state && (
            <p className="break-all text-ui-xs text-foreground-subtle">{state.workspacePath}</p>
          )}
          {state?.previewUrl && (
            <a
              href={state.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all underline"
              data-testid="studio-workspace-runtime-preview"
            >
              {state.previewUrl}
            </a>
          )}
          {(error || runtime.error || state?.errorCode) && (
            <p role="alert" className="text-destructive">
              {error || runtime.error || message(`error.${state!.errorCode}`)}
            </p>
          )}
          {!running && !recovering && (
            <>
              <p className="text-ui-xs text-foreground-subtle">{message("instructions")}</p>
              <Input
                aria-label={message("executable")}
                value={executable}
                onChange={(event) => setExecutable(event.target.value)}
                placeholder="node"
              />
              <Textarea
                aria-label={message("args")}
                value={args}
                onChange={(event) => setArgs(event.target.value)}
                rows={2}
              />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!running && !recovering && (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => void execute("prepare")}
              >
                {message("prepare")}
              </Button>
            )}
            {!running && !recovering && (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || !state?.prepared}
                onClick={() => void execute("start")}
              >
                {message("start")}
              </Button>
            )}
            {running && (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || state.phase === "stopping"}
                onClick={() => void execute("stop")}
              >
                {message("stop")}
              </Button>
            )}
            {recovering && (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => void execute("recover")}
              >
                {message("recover")}
              </Button>
            )}
          </div>
        </div>
      )}
    </details>
  );
}
