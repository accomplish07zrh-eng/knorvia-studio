import { MiniMap, Panel, useReactFlow } from "@xyflow/react";
import { Lock, Maximize, Minus, Plus, Unlock } from "lucide-react";
import { ToolButton } from "./WorkflowToolbar.js";
import { useWorkflowText } from "./useWorkflowText.js";

export function WorkflowCanvasControls({
  locked,
  onToggleLock,
}: {
  locked: boolean;
  onToggleLock: () => void;
}) {
  const t = useWorkflowText();
  const flow = useReactFlow();
  return (
    <>
      <MiniMap
        pannable
        zoomable
        nodeColor="var(--color-surface-hover)"
        nodeStrokeColor="var(--color-border)"
        maskColor="var(--color-surface)"
        className="hidden overflow-hidden rounded-xl border border-border shadow-none! md:block"
        style={{ background: "var(--color-background)", width: 160, height: 104 }}
      />
      <Panel position="bottom-left">
        <div className="flex flex-col rounded-lg border border-border bg-background p-0.5">
          <ToolButton label={t("zoomIn")} onClick={() => void flow.zoomIn()}>
            <Plus />
          </ToolButton>
          <ToolButton label={t("zoomOut")} onClick={() => void flow.zoomOut()}>
            <Minus />
          </ToolButton>
          <ToolButton
            label={t("fitView")}
            onClick={() => void flow.fitView({ padding: 0.25, maxZoom: 1 })}
          >
            <Maximize />
          </ToolButton>
          <ToolButton label={t(locked ? "unlock" : "lock")} active={locked} onClick={onToggleLock}>
            {locked ? <Lock /> : <Unlock />}
          </ToolButton>
        </div>
      </Panel>
    </>
  );
}
