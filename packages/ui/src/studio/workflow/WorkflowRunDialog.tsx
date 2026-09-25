import { useEffect, useMemo, useRef, useState } from "react";
import { studioWorkflowParams, type StudioWorkflowParam } from "@knorvia/services";
import { useStudioWorkflowStore } from "../../store/studioWorkflowStore.js";
import { useKnorviaIntl } from "../../i18n/IntlProvider.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Textarea } from "../../components/ui/textarea.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog.js";
import { workflowParamHint } from "./templateScenarios.js";
import { useWorkflowText } from "./useWorkflowText.js";

/** 参数值的本地形状校验；服务端仍会独立复核，这里只是提交前的即时反馈。 */
function parameterProblem(
  param: StudioWorkflowParam,
  value: string,
  t: (key: string) => string,
): string | undefined {
  if (param.type === "number" && (!value.trim() || !Number.isFinite(Number(value))))
    return t("parameterInvalidNumber");
  if (param.type === "boolean" && !["true", "false"].includes(value))
    return t("parameterInvalidBoolean");
  return undefined;
}

export function WorkflowRunDialog({
  open,
  onClose,
  onRun,
  busy,
  error,
  workflowId,
}: {
  open: boolean;
  onClose: () => void;
  /** 参数值随提交一并交给上层；未声明参数的工作流保持旧的单输入调用方式。 */
  onRun: (input: string, params?: Record<string, string>) => Promise<boolean>;
  busy: boolean;
  error?: string;
  workflowId: string;
}) {
  const t = useWorkflowText();
  const { locale } = useKnorviaIntl();
  // 参数说明只来自模板场景数据；自建参数没有说明时不显示占位文案。
  const language = locale.startsWith("zh") ? "zh" : "en";
  const input = useStudioWorkflowStore((state) => state.inputDrafts[workflowId] ?? "");
  const saveInput = useStudioWorkflowStore((state) => state.saveInput);
  const workflow = useStudioWorkflowStore((state) =>
    state.workflows.find((item) => item.id === workflowId),
  );
  // 同一参数名在多个节点声明时取第一份定义；界面只做展示与收集，判定仍以服务端为准。
  const declared = useMemo(() => {
    const merged = new Map<string, StudioWorkflowParam>();
    for (const node of workflow?.nodes ?? [])
      for (const param of studioWorkflowParams(node.data))
        if (!merged.has(param.name)) merged.set(param.name, param);
    return [...merged.values()];
  }, [workflow]);
  // 参数值是本地编辑状态，不是服务端事实；提交前不写入任何记录。
  const [values, setValues] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    if (open) return;
    setValues({});
    setProblem("");
  }, [open]);
  const resolved = () => {
    const result: Record<string, string> = {};
    for (const param of declared) {
      const value = values[param.name] ?? param.default ?? "";
      result[param.name] = value;
    }
    return result;
  };
  const validate = (candidate: Record<string, string>): string | undefined => {
    for (const param of declared) {
      const value = candidate[param.name] ?? "";
      if (!value && param.required === true && param.default === undefined)
        return t("parameterMissing").replace("{name}", param.label || param.name);
      if (value) {
        const issue = parameterProblem(param, value, t);
        if (issue) return `${param.label || param.name}: ${issue}`;
      }
    }
    return undefined;
  };
  const submit = async () => {
    if (busy || submitting.current) return;
    const candidate = resolved();
    const issue = validate(candidate);
    setProblem(issue ?? "");
    if (issue) return;
    submitting.current = true;
    try {
      if (await onRun(input, candidate)) {
        // 重开仍保留未提交输入，ACK 也不能清掉其他窗口/随后输入的新草稿。
        if (useStudioWorkflowStore.getState().inputDrafts[workflowId] === input)
          saveInput(workflowId, "");
        setValues({});
        onClose();
      }
    } finally {
      submitting.current = false;
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("run")}</DialogTitle>
          <DialogDescription>{t("inputHint")}</DialogDescription>
        </DialogHeader>
        {declared.length > 0 && (
          <div className="space-y-3">
            <p className="text-ui-sm text-foreground-subtle">{t("parameters")}</p>
            {declared.map((param) => {
              const hint = workflowParamHint(param.name, language);
              return (
                <label
                  key={param.name}
                  className="grid gap-2 text-ui-sm text-foreground-subtle"
                  htmlFor={`workflow-param-${param.name}`}
                >
                  <span>
                    {param.label || param.name}
                    {param.required === true && param.default === undefined
                      ? ` · ${t("parameterRequired")}`
                      : ""}
                  </span>
                  <Input
                    id={`workflow-param-${param.name}`}
                    type={param.type === "number" ? "number" : "text"}
                    disabled={busy}
                    maxLength={4000}
                    value={values[param.name] ?? param.default ?? ""}
                    placeholder={param.type === "boolean" ? "true / false" : ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [param.name]: event.target.value }))
                    }
                  />
                  {hint && <span className="text-ui-sm text-foreground-subtle">{hint}</span>}
                </label>
              );
            })}
          </div>
        )}
        <Textarea
          autoFocus={declared.length === 0}
          value={input}
          onChange={(event) => saveInput(workflowId, event.target.value)}
          disabled={busy}
          aria-label={t("input")}
          placeholder={t("inputPlaceholder")}
          maxLength={32000}
          className="min-h-28"
          onKeyDown={(event) => {
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key === "Enter" &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {(error || problem) && (
          <p role="alert" className="text-ui-sm text-destructive">
            {problem || error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {t("run")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
