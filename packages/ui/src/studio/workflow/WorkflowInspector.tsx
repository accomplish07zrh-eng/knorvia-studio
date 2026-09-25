import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CreationModel, StudioPermission } from "@knorvia/services";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Textarea } from "../../components/ui/textarea.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.js";
import { studioSelectableKernelOptions, type StudioKernelId } from "../types.js";
import { useStudioKernelCatalog } from "../agents/useStudioKernelCatalog.js";
import { useBaseWorkspaceServices } from "../../hooks/useWorkspaceServices.js";
import { WorkflowOutputs } from "./WorkflowInspectorOutputs.js";
import type { StudioWorkflow, StudioWorkflowNode, WorkflowNodeData } from "./types.js";
import { useWorkflowText } from "./useWorkflowText.js";

interface Props {
  workflow: StudioWorkflow;
  node?: StudioWorkflowNode;
  onChange: (data: Partial<WorkflowNodeData>) => void;
  onConnect: (target: string, handle?: string) => void;
  onRemoveEdge: (id: string) => void;
  onDelete: () => void;
}

export function WorkflowInspector({
  workflow,
  node,
  onChange,
  onConnect,
  onRemoveEdge,
  onDelete,
}: Props) {
  const t = useWorkflowText();
  const { statuses, inspected } = useStudioKernelCatalog();
  const creation = useBaseWorkspaceServices().creationService;
  const [creationModels, setCreationModels] = useState<CreationModel[]>([]);
  useEffect(() => {
    if (node?.data.kind !== "creation" || !creation) return;
    let live = true;
    void creation
      .listModels()
      .then((models) => {
        if (live) setCreationModels(models.filter((model) => model.enabled && model.configured));
      })
      .catch(() => {
        if (live) setCreationModels([]);
      });
    return () => {
      live = false;
    };
  }, [creation, node?.data.kind]);
  if (!node)
    return (
      <p className="px-5 py-10 text-center text-ui-base text-foreground-subtle">
        {t("noSelection")}
      </p>
    );
  const kind = node.data.kind;
  return (
    <div className="space-y-5 p-4">
      <label className="grid gap-2 text-ui-sm text-foreground-subtle">
        {t("nodeLabel")}
        <Input
          value={node.data.label}
          maxLength={120}
          placeholder={t(`kind.${kind}`)}
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </label>
      {kind === "agent" && (
        <label className="grid gap-2 text-ui-sm text-foreground-subtle">
          {t("permission")}
          <Select
            value={node.data.permission ?? "inherit"}
            onValueChange={(value) =>
              onChange({
                permission: value === "inherit" ? undefined : (value as StudioPermission),
              })
            }
          >
            <SelectTrigger className="w-full" aria-label={t("permission")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">{t("permissionInherit")}</SelectItem>
              <SelectItem value="read-only">{t("permissionReadOnly")}</SelectItem>
              <SelectItem value="ask">{t("permissionAsk")}</SelectItem>
              <SelectItem value="full-access">{t("permissionFullAccess")}</SelectItem>
            </SelectContent>
          </Select>
        </label>
      )}
      {["agent", "approval", "creation"].includes(kind) && (
        <WorkflowOutputs
          workflow={workflow}
          node={node}
          onOutputsChange={(names) => onChange({ outputNames: names })}
          onInsert={(name) =>
            onChange({
              prompt: `${node.data.prompt}${node.data.prompt ? "\n" : ""}{{ref.${name}}}`,
            })
          }
        />
      )}
      {kind === "agent" && (
        <>
          <label className="grid gap-2 text-ui-sm text-foreground-subtle">
            {t("kernel")}
            <Select
              value={node.data.kernel}
              onValueChange={(value) => onChange({ kernel: value as StudioKernelId })}
            >
              <SelectTrigger className="w-full" aria-label={t("kernel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {studioSelectableKernelOptions(statuses, [node.data.kernel]).map((kernel) => {
                  const available =
                    kernel.builtin || statuses.find((item) => item.id === kernel.id)?.installed;
                  return (
                    <SelectItem
                      key={kernel.id}
                      value={kernel.id}
                      disabled={inspected && !available && kernel.id !== node.data.kernel}
                    >
                      {kernel.name}
                      {inspected && !available ? ` · ${t("kernelUnavailable")}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-2 text-ui-sm text-foreground-subtle">
            {t("prompt")}
            <Textarea
              className="min-h-32 resize-y"
              value={node.data.prompt}
              maxLength={20000}
              placeholder={t("promptPlaceholder")}
              onChange={(event) => onChange({ prompt: event.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2 text-ui-sm text-foreground-subtle">
              {t("retryCount")}
              <Input
                type="number"
                min={0}
                max={5}
                value={node.data.retryCount}
                onChange={(event) =>
                  onChange({
                    retryCount: Math.min(
                      5,
                      Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                    ),
                  })
                }
              />
            </label>
            <label className="grid gap-2 text-ui-sm text-foreground-subtle">
              {t("retryDelay")}
              <Input
                type="number"
                min={0}
                max={3600}
                value={node.data.retryDelay}
                onChange={(event) =>
                  onChange({
                    retryDelay: Math.min(
                      3600,
                      Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                    ),
                  })
                }
              />
            </label>
          </div>
        </>
      )}
      {kind === "creation" && (
        <>
          <label className="grid gap-2 text-ui-sm text-foreground-subtle">
            {t("creationModel")}
            <select
              value={node.data.creationModelId ?? ""}
              onChange={(event) => onChange({ creationModelId: event.target.value })}
              className="h-9 w-full rounded-md border border-input-border bg-input px-2 text-ui-base text-foreground"
            >
              <option value="">{t("creationModelRequired")}</option>
              {creationModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · {model.kind === "image" ? "图片" : "视频"}
                </option>
              ))}
            </select>
          </label>
          {!creationModels.length ? (
            <p className="text-ui-sm text-foreground-subtle">{t("creationNoModels")}</p>
          ) : null}
          <label className="grid gap-2 text-ui-sm text-foreground-subtle">
            {t("prompt")}
            <Textarea
              className="min-h-32 resize-y"
              value={node.data.prompt}
              maxLength={20000}
              placeholder={t("promptPlaceholder")}
              onChange={(event) => onChange({ prompt: event.target.value })}
            />
          </label>
          {creationModels.find((model) => model.id === node.data.creationModelId)?.kind !==
          "video" ? (
            <label className="grid gap-2 text-ui-sm text-foreground-subtle">
              {t("creationReferencePath")}
              <Input
                value={node.data.creationReferencePath ?? ""}
                maxLength={2048}
                placeholder={t("creationReferenceHint")}
                onChange={(event) => onChange({ creationReferencePath: event.target.value })}
              />
            </label>
          ) : null}
        </>
      )}
      {kind === "approval" && (
        <label className="grid gap-2 text-ui-sm text-foreground-subtle">
          {t("approvalPrompt")}
          <Textarea
            className="min-h-32 resize-y"
            value={node.data.prompt}
            maxLength={20000}
            placeholder={t("approvalPlaceholder")}
            onChange={(event) => onChange({ prompt: event.target.value })}
          />
        </label>
      )}
      {kind === "condition" && (
        <div className="space-y-2">
          <label className="grid gap-2 text-ui-sm text-foreground-subtle">
            {t("condition")}
            <Textarea
              className="min-h-24 resize-y font-mono"
              value={node.data.condition}
              maxLength={2000}
              placeholder={t("conditionPlaceholder")}
              onChange={(event) => onChange({ condition: event.target.value })}
            />
          </label>
          <p className="text-ui-sm text-foreground-subtle">{t("conditionHint")}</p>
        </div>
      )}
      {kind === "join" && (
        <label className="grid gap-2 text-ui-sm text-foreground-subtle">
          {t("joinPolicy")}
          <Select
            value={node.data.joinPolicy}
            onValueChange={(value) => onChange({ joinPolicy: value as "all" | "any" })}
          >
            <SelectTrigger className="w-full" aria-label={t("joinPolicy")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("waitAll")}</SelectItem>
              <SelectItem value="any">{t("waitAny")}</SelectItem>
            </SelectContent>
          </Select>
        </label>
      )}
      {["start", "parallel", "join", "end"].includes(kind) && (
        <p className="text-ui-sm text-foreground-subtle">{t(`${kind}Hint`)}</p>
      )}
      {kind !== "end" && (
        <Connections
          key={node.id}
          workflow={workflow}
          node={node}
          onConnect={onConnect}
          onRemoveEdge={onRemoveEdge}
        />
      )}
      <div className="border-t border-border pt-4">
        <Button variant="ghost" className="text-destructive" onClick={onDelete}>
          <Trash2 aria-hidden="true" />
          {t("deleteNode")}
        </Button>
      </div>
    </div>
  );
}

function Connections({
  workflow,
  node,
  onConnect,
  onRemoveEdge,
}: Pick<Props, "workflow" | "onConnect" | "onRemoveEdge"> & { node: StudioWorkflowNode }) {
  const t = useWorkflowText();
  const [target, setTarget] = useState("");
  const [branch, setBranch] = useState("yes");
  const available = workflow.nodes.filter(
    (item) => item.id !== node.id && item.data.kind !== "start",
  );
  const outgoing = workflow.edges.filter((edge) => edge.source === node.id);
  return (
    <div className="space-y-2">
      <h3 className="text-ui-sm text-foreground-subtle">{t("connections")}</h3>
      {outgoing.map((edge) => {
        const to = workflow.nodes.find((item) => item.id === edge.target);
        return (
          <div key={edge.id} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1">
            {node.data.kind === "condition" && (
              <span className="text-ui-xs text-foreground-subtle">
                {t(edge.sourceHandle === "yes" ? "yes" : "no")}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-ui-sm">
              {to?.data.label || t(`kind.${to?.data.kind ?? "end"}`)}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("removeConnection")}
              onClick={() => onRemoveEdge(edge.id)}
            >
              <X />
            </Button>
          </div>
        );
      })}
      {node.data.kind === "condition" && (
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="w-full" aria-label={t("outgoing")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">{t("yes")}</SelectItem>
            <SelectItem value="no">{t("no")}</SelectItem>
          </SelectContent>
        </Select>
      )}
      <div className="flex items-center gap-1">
        <Select
          value={available.some((item) => item.id === target) ? target : ""}
          onValueChange={setTarget}
        >
          <SelectTrigger className="min-w-0 flex-1" aria-label={t("connectionTarget")}>
            <SelectValue placeholder={t("connectionTarget")} />
          </SelectTrigger>
          <SelectContent>
            {available.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.data.label || t(`kind.${item.data.kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon-md"
          disabled={!available.some((item) => item.id === target)}
          aria-label={t("connect")}
          onClick={() => {
            onConnect(target, node.data.kind === "condition" ? branch : undefined);
            setTarget("");
          }}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
