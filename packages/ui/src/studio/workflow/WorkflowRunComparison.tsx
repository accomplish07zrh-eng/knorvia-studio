import { useMemo, useState } from "react";
import type { StudioRun } from "@knorvia/services";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { compareWorkflowRuns, type WorkflowNodeComparisonSide } from "./workflowComparisonProjection.js";
import { useWorkflowText } from "./useWorkflowText.js";

function RunSide({ value, label }: { value: WorkflowNodeComparisonSide; label: string }) {
  const t = useWorkflowText();
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="text-ui-xs text-foreground-subtle">{label} · {t(`compareState.${value.state}`)}</p>
      {value.output && <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-ui-xs">{value.output}</pre>}
      {value.truncated && <p className="mt-1 text-ui-xs text-foreground-subtle">{t("compareTruncated")}</p>}
    </div>
  );
}

export function WorkflowRunComparison({ runs }: { runs: StudioRun[] }) {
  const t = useWorkflowText();
  const ordered = useMemo(
    () => runs.filter((run) => run.kind === "workflow").sort((a, b) => b.createdAt - a.createdAt),
    [runs],
  );
  const [firstId, setFirstId] = useState<string | null>(null);
  const [secondId, setSecondId] = useState<string | null>(null);
  if (ordered.length < 2) return null;
  const first = ordered.find((run) => run.id === firstId) ?? ordered[1]!;
  const second = ordered.find((run) => run.id === secondId) ?? ordered[0]!;
  const comparison = first.id === second.id ? [] : compareWorkflowRuns(first, second);
  const runLabel = (run: StudioRun) =>
    `${new Date(run.createdAt).toLocaleString()} · ${t(`compareState.${run.state}`)}`;
  return (
    <details className="mx-2 rounded-lg border border-border p-2 text-ui-sm">
      <summary className="cursor-pointer">{t("compareRuns")}</summary>
      <div className="mt-3 grid gap-2">
        <Select value={first.id} onValueChange={setFirstId}>
          <SelectTrigger aria-label={t("compareFirst")}><SelectValue /></SelectTrigger>
          <SelectContent>
            {ordered.map((run) => <SelectItem key={run.id} value={run.id}>{runLabel(run)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={second.id} onValueChange={setSecondId}>
          <SelectTrigger aria-label={t("compareSecond")}><SelectValue /></SelectTrigger>
          <SelectContent>
            {ordered.map((run) => <SelectItem key={run.id} value={run.id}>{runLabel(run)}</SelectItem>)}
          </SelectContent>
        </Select>
        {first.id === second.id && <p className="text-foreground-subtle">{t("compareChooseDifferent")}</p>}
        {comparison.map((node) => (
          <div key={node.id} className="rounded-md border border-border bg-surface p-2">
            <p className="mb-2 font-medium [overflow-wrap:anywhere]">
              {node.second.label !== node.id ? node.second.label : node.first.label}
              {node.changed && <span className="ml-2 text-foreground-subtle">· {t("compareChanged")}</span>}
            </p>
            <div className="grid gap-2">
              <RunSide value={node.first} label={t("compareFirst")} />
              <RunSide value={node.second} label={t("compareSecond")} />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
