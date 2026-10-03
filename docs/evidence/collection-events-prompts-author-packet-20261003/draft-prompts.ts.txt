import type {
    WorkflowGraphCollection,
    WorkflowGraphNode,
    WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { collectionNodeIdsForGraph, nodeById } from "./graph.js";

export function buildDefaultNodePrompt(
    snapshot: WorkflowRunSnapshot,
    node: WorkflowGraphNode,
    phase: string,
): string {
    const artifactLines = snapshot.artifacts
        .map((artifact) => `- ${artifact.label}: ${artifact.path}`)
        .join("\n");
    const sections = [
        `You are running a Knorvia Studio workflow node for phase: ${phase}.`,
        `Workflow run: ${snapshot.runId}`,
        `Working directory: ${snapshot.cwd}`,
        "",
        `User task:\n${snapshot.task}`,
        "",
        `Node: ${node.title}`,
        `Node id: ${node.id}`,
    ];

    if (node.description) {
        sections.push(`Node objective:\n${node.description}`);
    }
    if (node.prompt) {
        sections.push(`Node prompt:\n${node.prompt}`);
    }
    sections.push(
        "",
        artifactLines.length > 0
            ? `Previous artifacts available on disk:\n${artifactLines}`
            : "No previous artifacts yet.",
        "",
        "Execute only this node's scope. Return a concise Markdown artifact with changes, validation, and residual risk.",
    );

    return sections.join("\n");
}

export function buildDefaultPlannerPrompt(
    snapshot: WorkflowRunSnapshot,
    collection: WorkflowGraphCollection,
    phase: string,
): string {
    const nodeIds = collectionNodeIdsForGraph(collection, snapshot.graph);
    const resolvedNodes = nodeIds.map((id) => nodeById(snapshot.graph, id));
    const nodeLines = resolvedNodes
        .filter((node): node is WorkflowGraphNode => node !== undefined)
        .map((node) => {
            const description = node.description ? ` - ${node.description}` : "";
            return `- ${node.id} [${node.status}]: ${node.title}${description}`;
        })
        .join("\n");
    const sections = [
        `You are running a Knorvia Studio workflow exploration planner for phase: ${phase}.`,
        `Workflow run: ${snapshot.runId}`,
        `Working directory: ${snapshot.cwd}`,
        "",
        `User task:\n${snapshot.task}`,
        "",
        `Collection: ${collection.title ?? collection.collectionId}`,
        `Collection id: ${collection.collectionId}`,
    ];

    if (collection.goal) {
        sections.push(`Goal:\n${collection.goal}`);
    }
    if (collection.metric) {
        sections.push(`Metric:\n${collection.metric}`);
    }
    sections.push(
        "",
        nodeLines.length > 0
            ? `Existing collection nodes:\n${nodeLines}`
            : "No existing collection nodes.",
        "",
        "Return only JSON matching this shape:",
        '{"nodes":[{"id":"string","title":"string","description":"string","dependsOn":["node-id"],"prompt":"string"}],"edges":[{"from":"node-id","to":"node-id"}],"collectionNodeIds":["node-id"],"exhausted":false,"reasoning":"string"}',
        "Use unique node ids, avoid cycles, and set exhausted=true only when no useful expansion remains.",
    );

    return sections.join("\n");
}

export function safeArtifactName(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100) || "node";
}
