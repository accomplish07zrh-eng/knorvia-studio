import type { ComponentProps } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Clock3,
  Folder,
  PanelRight,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { Button } from "../../components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import { useStudioWorkflowStore } from "../../store/studioWorkflowStore.js";
import { WORKFLOW_NODE_KINDS, type StudioWorkflow, type WorkflowNodeKind } from "./types.js";
import { WORKFLOW_NODE_ICONS } from "./WorkflowNode.js";
import { WorkflowMenu } from "./WorkflowLibrary.js";
import { useWorkflowText } from "./useWorkflowText.js";
import type { useWorkflowExecution } from "./useWorkflowExecution.js";

export type WorkflowPane = "inspector" | "history" | "validation" | null;
interface Props {
  workflow: StudioWorkflow;
  onBack: () => void;
  onRename: (workflow: StudioWorkflow) => void;
  onDuplicate: (workflow: StudioWorkflow) => void;
  onDelete: (workflow: StudioWorkflow) => void;
  rightPane: WorkflowPane;
  setRightPane: (pane: WorkflowPane) => void;
  onAdd: (kind: WorkflowNodeKind) => void;
  execution: ReturnType<typeof useWorkflowExecution>;
  onRun: () => void;
  onSchedule: () => void;
  canRun: boolean;
  editingDisabled: boolean;
  onImport: () => void;
  onExport: (workflow: StudioWorkflow) => void;
}

export function WorkflowToolbar({
  workflow,
  onBack,
  onRename,
  onDuplicate,
  onDelete,
  rightPane,
  setRightPane,
  onAdd,
  execution,
  onRun,
  onSchedule,
  canRun,
  editingDisabled,
  onImport,
  onExport,
}: Props) {
  const t = useWorkflowText();
  const store = useStudioWorkflowStore();
  const history = store.history[workflow.id];
  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-2">
      <ToolButton label={t("back")} onClick={onBack}>
        <ArrowLeft />
      </ToolButton>
      <button
        type="button"
        className="min-w-0 max-w-56 truncate px-1 text-left text-ui-base font-medium hover:text-foreground-subtle"
        onClick={() => onRename(workflow)}
        title={t("rename")}
        disabled={execution.editingDisabled}
      >
        {workflow.name}
      </button>
      <WorkflowMenu
        workflow={workflow}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onImport={onImport}
        onExport={onExport}
        disabled={execution.editingDisabled}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-2 min-w-0 max-w-44 gap-1 text-ui-sm text-foreground-subtle"
        title={workflow.workspacePath || t("selectProject")}
        disabled={execution.busy || Boolean(execution.running)}
        onClick={() => void execution.selectProject()}
      >
        <Folder className="size-3.5 shrink-0" />
        <span className="truncate">
          {workflow.workspacePath.split(/[\\/]/).filter(Boolean).at(-1) || t("selectProject")}
        </span>
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <span
          className="mr-2 hidden items-center gap-1 text-ui-xs text-foreground-subtle md:flex"
          role="status"
        >
          {execution.saved && <Check className="size-3" />}
          {t(execution.saved ? "saved" : "unsaved")}
        </span>
        <ToolButton
          label={t("undo")}
          disabled={!history?.past.length || editingDisabled}
          onClick={() => store.undo(workflow.id)}
        >
          <Undo2 />
        </ToolButton>
        <ToolButton
          label={t("redo")}
          disabled={!history?.future.length || editingDisabled}
          onClick={() => store.redo(workflow.id)}
        >
          <Redo2 />
        </ToolButton>
        <span className="mx-1 h-4 border-l border-border" />
        <NodeMenu onAdd={onAdd} disabled={editingDisabled} />
        <ToolButton
          label={t("inspector")}
          active={rightPane === "inspector"}
          onClick={() => setRightPane(rightPane === "inspector" ? null : "inspector")}
        >
          <PanelRight />
        </ToolButton>
        <ToolButton
          label={t("history")}
          active={rightPane === "history"}
          onClick={() => setRightPane(rightPane === "history" ? null : "history")}
        >
          <Clock3 />
        </ToolButton>
        <ToolButton
          label={t("validate")}
          active={rightPane === "validation"}
          onClick={() => setRightPane(rightPane === "validation" ? null : "validation")}
        >
          <ShieldCheck />
        </ToolButton>
        <ToolButton
          label={t("save")}
          disabled={execution.busy || !execution.ready}
          onClick={() => void execution.saveCurrent()}
        >
          <Save />
        </ToolButton>
        <ToolButton
          label={t("schedule")}
          disabled={!execution.ready || !execution.saved || !canRun || !workflow.workspacePath}
          onClick={onSchedule}
        >
          <CalendarClock />
        </ToolButton>
        {execution.running ? (
          <ToolButton
            label={t(execution.stopping || execution.running.cancelRequested ? "stopping" : "stop")}
            disabled={execution.stopping || execution.running.cancelRequested}
            onClick={() => void execution.stop()}
          >
            <Square />
          </ToolButton>
        ) : (
          <ToolButton
            label={t("run")}
            disabled={execution.busy || !execution.ready || !canRun || !workflow.workspacePath}
            onClick={onRun}
          >
            <Play />
          </ToolButton>
        )}
      </div>
    </header>
  );
}

export function ToolButton({
  label,
  active,
  ...props
}: ComponentProps<typeof Button> & { label: string; active?: boolean }) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="icon-md"
      title={label}
      aria-label={label}
      aria-pressed={active}
      {...props}
    />
  );
}

export function NodeMenu({
  onAdd,
  label,
  disabled,
}: {
  onAdd: (kind: WorkflowNodeKind) => void;
  label?: string;
  disabled?: boolean;
}) {
  const t = useWorkflowText();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {label ? (
          <Button variant="outline" disabled={disabled}>
            <Plus />
            {label}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-md"
            title={t("addNode")}
            aria-label={t("addNode")}
            disabled={disabled}
          >
            <Plus />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {WORKFLOW_NODE_KINDS.map((kind) => {
          const Icon = WORKFLOW_NODE_ICONS[kind];
          return (
            <DropdownMenuItem key={kind} onSelect={() => onAdd(kind)}>
              <Icon className="size-4" aria-hidden="true" />
              {t(`kind.${kind}`)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
