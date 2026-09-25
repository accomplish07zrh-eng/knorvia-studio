import { useEffect, useMemo, useState } from "react";
import { studioWorkflowOutputNames } from "@knorvia/services";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Plus } from "lucide-react";
import type { StudioWorkflow, StudioWorkflowNode } from "./types.js";
import { useWorkflowText } from "./useWorkflowText.js";

/** 输出名必须能安全地写进 `{{ref.名称}}`；界面只做规范化，合法性仍由校验面板判定。 */
function normalizeOutputName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^[^a-z]+/, "")
    .slice(0, 64);
}

/** 只有前置节点才允许被引用：沿入边反向遍历，旁支与后继都不在集合里。 */
function ancestorIds(workflow: StudioWorkflow, id: string): Set<string> {
  const found = new Set<string>();
  const pending = [id];
  for (let index = 0; index < pending.length; index++)
    for (const edge of workflow.edges)
      if (edge.target === pending[index] && !found.has(edge.source)) {
        found.add(edge.source);
        pending.push(edge.source);
      }
  return found;
}

/**
 * 上游输出选择器：只列出前置节点**自己声明的**输出名，插入 `{{ref.<name>}}` 文本。
 * 不保存节点 id 引用，因此复制或导入重写节点 id 时不会留下悬空引用。
 */
export function WorkflowOutputs({
  workflow,
  node,
  onOutputsChange,
  onInsert,
}: {
  workflow: StudioWorkflow;
  node: StudioWorkflowNode;
  onOutputsChange: (names: string[]) => void;
  onInsert: (name: string) => void;
}) {
  const t = useWorkflowText();
  const [draft, setDraft] = useState(() => studioWorkflowOutputNames(node.data).join(", "));
  const [selected, setSelected] = useState("");
  useEffect(() => {
    setDraft(studioWorkflowOutputNames(node.data).join(", "));
    setSelected("");
  }, [node.id]);
  const available = useMemo(() => {
    const ancestors = ancestorIds(workflow, node.id);
    const names: string[] = [];
    for (const item of workflow.nodes)
      if (ancestors.has(item.id))
        for (const name of studioWorkflowOutputNames(item.data))
          if (!names.includes(name)) names.push(name);
    return names;
  }, [workflow, node.id]);
  return (
    <div className="space-y-2">
      <label className="grid gap-2 text-ui-sm text-foreground-subtle">
        {t("outputs")}
        <Input
          value={draft}
          maxLength={1024}
          placeholder={t("outputsPlaceholder")}
          onChange={(event) => {
            setDraft(event.target.value);
            onOutputsChange([
              ...new Set(event.target.value.split(",").map(normalizeOutputName).filter(Boolean)),
            ]);
          }}
        />
      </label>
      <p className="text-ui-sm text-foreground-subtle">{t("outputsHint")}</p>
      <div className="flex items-center gap-1">
        <select
          aria-label={t("insertOutput")}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-input-border bg-input px-2 text-ui-base text-foreground"
        >
          <option value="">{available.length ? t("insertOutput") : t("insertOutputNone")}</option>
          {available.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="icon-md"
          disabled={!selected}
          aria-label={t("insertOutput")}
          onClick={() => {
            if (!selected) return;
            onInsert(selected);
            setSelected("");
          }}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
