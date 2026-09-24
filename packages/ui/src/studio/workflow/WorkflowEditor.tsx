import { WorkflowCanvasControls } from "./WorkflowCanvasControls.js";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Panel,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { Trash2, X } from "lucide-react";
import { Button } from "../../components/ui/button.js";
import { useStudioWorkflowStore } from "../../store/studioWorkflowStore.js";
import { validateWorkflowGraph } from "./graph.js";
import { connectWorkflow } from "./connection.js";
import {
  makeWorkflowNode,
  WORKFLOW_LIMITS,
  type StudioWorkflow,
  type StudioWorkflowNode,
  type WorkflowNodeKind,
} from "./types.js";
import { WorkflowToolbar, ToolButton, NodeMenu, type WorkflowPane } from "./WorkflowToolbar.js";
import { WorkflowNode } from "./WorkflowNode.js";
import { WorkflowInspector } from "./WorkflowInspector.js";
import { useWorkflowText } from "./useWorkflowText.js";
import { useWorkflowExecution } from "./useWorkflowExecution.js";
import { WorkflowRunDialog } from "./WorkflowRunDialog.js";
import { WorkflowValidationPanel } from "./WorkflowValidationPanel.js";
import { StudioRunHistory } from "../runtime/StudioRunHistory.js";
import { StudioTimeline } from "../runtime/StudioTimeline.js";
import { StudioInteractions } from "../runtime/StudioInteractions.js";
import { WorkflowRunComparison } from "./WorkflowRunComparison.js";
import "@xyflow/react/dist/style.css";
import "./workflow.css";

const nodeTypes = { studio: WorkflowNode };
interface Props {
  workflow: StudioWorkflow;
  onBack: () => void;
  onRename: (workflow: StudioWorkflow) => void;
  onDuplicate: (workflow: StudioWorkflow) => void;
  onDelete: (workflow: StudioWorkflow) => void;
  onImport: () => void;
  onExport: (workflow: StudioWorkflow) => void;
  initialValidation?: boolean;
}

export function WorkflowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorCanvas {...props} />
    </ReactFlowProvider>
  );
}

function EditorCanvas({
  workflow,
  onBack,
  onRename,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
  initialValidation,
}: Props) {
  const t = useWorkflowText();
  const store = useStudioWorkflowStore();
  const execution = useWorkflowExecution(workflow);
  const flow = useReactFlow<StudioWorkflowNode>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [rightPane, setRightPane] = useState<WorkflowPane>(initialValidation ? "validation" : null);
  const [locked, setLocked] = useState(false);
  const [limit, setLimit] = useState(false);
  const [runDialog, setRunDialog] = useState(false);
  const editingDisabled = locked || execution.editingDisabled;
  const waiting = execution.timeline?.interactions.some((item) => item.status === "pending");
  useEffect(() => {
    if (waiting) setRightPane("history");
  }, [waiting]);
  const issues = useMemo(() => validateWorkflowGraph(workflow), [workflow]);
  const selectedNode = workflow.nodes.find((node) => node.id === selectedId);
  const selectedEdge = workflow.edges.find((edge) => edge.id === selectedEdgeId);
  const nodes = useMemo(
    () =>
      workflow.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedId,
        data: { ...node.data, executionState: execution.states.get(node.id) },
      })),
    [workflow.nodes, selectedId, execution.states],
  );
  const edges = useMemo(
    () =>
      workflow.edges.map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId,
        sourceHandle: edge.sourceHandle === "out" ? null : edge.sourceHandle,
        targetHandle: edge.targetHandle === "in" ? null : edge.targetHandle,
        label: ["yes", "no"].includes(edge.sourceHandle ?? "") ? t(edge.sourceHandle!) : undefined,
      })),
    [workflow.edges, selectedEdgeId, t],
  );
  const connect = (connection: Connection) => {
    if (editingDisabled) return;
    const next = connectWorkflow(workflow, connection);
    if (next !== workflow.edges)
      store.updateGraph(workflow.id, { nodes: workflow.nodes, edges: next });
  };
  const removeEdges = (ids: Set<string>) => {
    if (editingDisabled) return;
    store.removeEdges(workflow.id, [...ids]);
    setSelectedEdgeId(null);
  };
  const removeNodes = (ids: Set<string>) => {
    if (editingDisabled) return;
    store.removeNodes(workflow.id, [...ids]);
    setSelectedId(null);
  };
  const onNodesChange = (changes: NodeChange<StudioWorkflowNode>[]) => {
    const selected = changes.find((change) => change.type === "select" && change.selected);
    if (selected?.type === "select") {
      setSelectedId(selected.id);
      setSelectedEdgeId(null);
    }
    const removed = changes.filter((change) => change.type === "remove");
    if (removed.length) {
      removeNodes(new Set(removed.map((change) => change.id)));
      return;
    }
    const positions = changes.filter((change) => change.type === "position" && change.position);
    if (!positions.length || editingDisabled) return;
    const gesture = positions.some(
      (change) => change.type === "position" && change.dragging !== undefined,
    );
    const dragging = positions.some((change) => change.type === "position" && change.dragging);
    store.updateGraph(
      workflow.id,
      { nodes: applyNodeChanges(positions, workflow.nodes), edges: workflow.edges },
      { checkpoint: !gesture, persist: !dragging },
    );
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    const selected = changes.find((change) => change.type === "select" && change.selected);
    if (selected?.type === "select") {
      setSelectedEdgeId(selected.id);
      setSelectedId(null);
    }
    const removed = changes.filter((change) => change.type === "remove");
    if (removed.length) removeEdges(new Set(removed.map((change) => change.id)));
  };
  const addNode = (kind: WorkflowNodeKind) => {
    if (editingDisabled) return;
    if (workflow.nodes.length >= WORKFLOW_LIMITS.nodes) {
      setLimit(true);
      return;
    }
    const viewport = flow.getViewport();
    const position = {
      x: (260 - viewport.x) / viewport.zoom,
      y: (160 - viewport.y) / viewport.zoom,
    };
    const node = makeWorkflowNode(kind, position);
    store.updateGraph(workflow.id, { nodes: [...workflow.nodes, node], edges: workflow.edges });
    setSelectedId(node.id);
    setSelectedEdgeId(null);
    setRightPane("inspector");
  };
  const shortcuts = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      void execution.saveCurrent();
      return;
    }
    if ((event.target as HTMLElement).closest("input,textarea,[contenteditable='true']")) return;
    if (event.key.toLowerCase() === "z" && !editingDisabled) {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) store.redo(workflow.id);
      else store.undo(workflow.id);
    }
    if (event.key.toLowerCase() === "y" && !editingDisabled) {
      event.preventDefault();
      event.stopPropagation();
      store.redo(workflow.id);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDownCapture={shortcuts}>
      <WorkflowToolbar
        workflow={workflow}
        onBack={onBack}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onImport={onImport}
        onExport={onExport}
        editingDisabled={editingDisabled}
        rightPane={rightPane}
        setRightPane={setRightPane}
        onAdd={addNode}
        execution={execution}
        canRun={issues.length === 0}
        onRun={() => setRunDialog(true)}
      />
      {execution.error && (
        <p
          role="alert"
          className="break-words border-b border-border px-4 py-2 text-ui-sm text-destructive"
        >
          {execution.error}
        </p>
      )}
      <WorkflowRunDialog
        open={runDialog}
        workflowId={workflow.id}
        onClose={() => setRunDialog(false)}
        busy={execution.busy}
        error={execution.error}
        onRun={async (input) => {
          const accepted = await execution.run(input);
          if (accepted) setRightPane("history");
          return accepted;
        }}
      />
      {limit && (
        <div
          role="alert"
          className="flex items-center justify-between px-4 py-2 text-ui-sm text-warning"
        >
          {t("limit")}
          <Button variant="ghost" size="sm" onClick={() => setLimit(false)}>
            {t("close")}
          </Button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <div className="studio-workflow-canvas min-h-72 min-w-0 flex-1">
          <ReactFlow<StudioWorkflowNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={connect}
            onNodeDragStart={() => {
              if (!editingDisabled) store.checkpoint(workflow.id);
            }}
            onNodeDragStop={store.save}
            onNodeClick={(_, node) => {
              setSelectedId(node.id);
              setSelectedEdgeId(null);
              setRightPane("inspector");
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedId(null);
            }}
            onPaneClick={() => {
              setSelectedId(null);
              setSelectedEdgeId(null);
            }}
            nodesDraggable={!editingDisabled}
            nodesConnectable={!editingDisabled}
            edgesReconnectable={false}
            minZoom={0.2}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            deleteKeyCode={editingDisabled ? null : ["Delete", "Backspace"]}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              style: { stroke: "var(--color-foreground-subtlest)", strokeWidth: 1.5 },
            }}
            aria-label={t("title")}
            ariaLabelConfig={{
              "minimap.ariaLabel": t("title"),
              "node.a11yDescription.default": t("canvasHint"),
              "edge.a11yDescription.default": t("deleteEdgeHint"),
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="var(--color-border)"
              bgColor="var(--color-background)"
            />
            <WorkflowCanvasControls locked={locked} onToggleLock={() => setLocked(!locked)} />
            {!workflow.nodes.length && (
              <Panel position="top-center" className="mt-20! max-w-sm text-center">
                <NodeMenu onAdd={addNode} label={t("addFirst")} disabled={editingDisabled} />
                <p className="mt-3 text-ui-sm text-foreground-subtle">{t("canvasHint")}</p>
              </Panel>
            )}
            {selectedEdge && (
              <Panel position="top-center">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-popover px-3 py-2 text-ui-sm shadow-md">
                  <span>{t("selectedEdge")}</span>
                  <ToolButton
                    label={t("removeConnection")}
                    disabled={editingDisabled}
                    onClick={() => removeEdges(new Set([selectedEdge.id]))}
                  >
                    <Trash2 />
                  </ToolButton>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
        {rightPane && (
          <aside
            className="absolute inset-y-0 right-0 z-10 flex w-80 max-w-full shrink-0 flex-col border-l border-border bg-background shadow-md lg:static lg:shadow-none"
            aria-label={t(rightPane === "validation" ? "validationTitle" : rightPane)}
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
              <h2 className="text-ui-base font-medium">
                {t(rightPane === "validation" ? "validationTitle" : rightPane)}
              </h2>
              <ToolButton label={t("close")} onClick={() => setRightPane(null)}>
                <X />
              </ToolButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {rightPane === "inspector" && (
                <fieldset disabled={editingDisabled}>
                  <WorkflowInspector
                    workflow={workflow}
                    node={selectedNode}
                    onChange={(data) => {
                      if (editingDisabled) return;
                      store.updateGraph(workflow.id, {
                        nodes: workflow.nodes.map((node) =>
                          node.id === selectedId
                            ? { ...node, data: { ...node.data, ...data } }
                            : node,
                        ),
                        edges: workflow.edges,
                      });
                    }}
                    onConnect={(target, handle) => {
                      if (selectedId)
                        connect({
                          source: selectedId,
                          target,
                          sourceHandle: handle ?? null,
                          targetHandle: null,
                        });
                    }}
                    onRemoveEdge={(id) => removeEdges(new Set([id]))}
                    onDelete={() => {
                      if (selectedId) removeNodes(new Set([selectedId]));
                    }}
                  />
                </fieldset>
              )}
              {rightPane === "history" && (
                <div className="space-y-3">
                  <WorkflowRunComparison runs={execution.timeline?.runs ?? []} />
                  <div className="px-2 pt-2">
                    <StudioInteractions targetId={workflow.id} />
                  </div>
                  <StudioRunHistory targetId={workflow.id} />
                  <div className="flex min-h-0 max-h-[60vh] flex-col">
                    <StudioTimeline
                      targetId={workflow.id}
                      showHistory={false}
                      showInteractions={false}
                    />
                  </div>
                </div>
              )}
              {rightPane === "validation" && (
                <WorkflowValidationPanel
                  workflow={workflow}
                  issues={issues}
                  onSelect={(node) => {
                    setSelectedId(node.id);
                    setSelectedEdgeId(null);
                    setRightPane("inspector");
                    void flow.fitView({ nodes: [{ id: node.id }], maxZoom: 1, padding: 0.8 });
                  }}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
