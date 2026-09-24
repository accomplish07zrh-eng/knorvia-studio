import { useRef, useState } from "react";
import type { StudioInteraction, StudioKernelAnswer } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioRuntime } from "./useStudioRuntime.js";
import { studioApprovalChoices, studioInteractionAnswers } from "./studioInteractionAnswers.js";

export function StudioInteractions({ targetId }: { targetId: string }) {
  const runtime = useStudioRuntime(targetId);
  return (
    <div className="space-y-3">
      {runtime.timeline?.interactions
        .filter((item) => item.status === "pending")
        .map((item) => (
          <InteractionCard
            key={`${runtime.connectionKey}:${targetId}:${item.id}`}
            item={item}
            answer={async (answer) => {
              await runtime.command({ type: "answer", interactionId: item.id, answer });
            }}
          />
        ))}
    </div>
  );
}

function InteractionCard({
  item,
  answer,
}: {
  item: StudioInteraction;
  answer(value: StudioKernelAnswer): Promise<void>;
}) {
  const { locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const pending = useRef(false);
  const answers = studioInteractionAnswers(item.questions ?? [], values, custom);
  const choices = studioApprovalChoices(item);
  const disabled = busy || submitted;
  const submit = async (value: StudioKernelAnswer) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await answer(value);
      setSubmitted(true);
    } catch (error) {
      pending.current = false;
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="rounded-xl border border-border bg-surface p-4 text-ui-base"
      aria-label={item.title}
      aria-busy={busy}
    >
      <p className="break-words font-medium">{item.title}</p>
      {item.detail && (
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-ui-sm text-foreground-subtle">
          {item.detail}
        </pre>
      )}
      {item.questions?.map((question) => (
        <fieldset key={question.id} disabled={disabled} className="mt-3 min-w-0 space-y-2">
          <legend className="max-w-full break-words text-ui-sm">{question.title}</legend>
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <Button
                key={option}
                size="sm"
                className="h-auto max-w-full whitespace-normal break-words py-1.5 text-left"
                variant={values[question.id]?.includes(option) ? "secondary" : "outline"}
                aria-pressed={values[question.id]?.includes(option) ?? false}
                onClick={() => {
                  if (!question.multiple) setCustom((old) => ({ ...old, [question.id]: "" }));
                  setValues((old) => ({
                    ...old,
                    [question.id]: question.multiple
                      ? old[question.id]?.includes(option)
                        ? (old[question.id] ?? []).filter((entry) => entry !== option)
                        : [...(old[question.id] ?? []), option]
                      : [option],
                  }));
                }}
              >
                {option}
              </Button>
            ))}
          </div>
          <Input
            aria-label={question.title}
            placeholder={zh ? "也可以输入自己的回答" : "Or enter your answer"}
            value={custom[question.id] ?? ""}
            onChange={(event) => {
              setCustom((old) => ({ ...old, [question.id]: event.target.value }));
              if (!question.multiple) setValues((old) => ({ ...old, [question.id]: [] }));
            }}
          />
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="mt-2 text-ui-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {submitted && (
          <span role="status" className="self-center text-ui-sm text-foreground-subtle">
            {zh ? "已提交" : "Submitted"}
          </span>
        )}
        {(item.kind !== "approval" || choices.includes("deny")) && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void submit({ decision: "deny" })}
          >
            {zh ? "拒绝" : "Deny"}
          </Button>
        )}
        {item.kind === "approval" ? (
          <>
            {choices.includes("allow-once") && (
              <Button
                size="sm"
                disabled={disabled}
                onClick={() => void submit({ decision: "allow-once" })}
              >
                {zh ? "允许这一次" : "Allow once"}
              </Button>
            )}
            {choices.includes("allow-session") && (
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => void submit({ decision: "allow-session" })}
              >
                {zh ? "本次会话允许" : "Allow for session"}
              </Button>
            )}
          </>
        ) : (
          <Button
            size="sm"
            disabled={
              disabled ||
              !item.questions?.length ||
              item.questions?.some((question) => !answers[question.id]?.length)
            }
            onClick={() => void submit({ answers })}
          >
            {zh ? "回答" : "Answer"}
          </Button>
        )}
      </div>
    </section>
  );
}
