// Diagnostic boundary doubles only. These are not replacement product dependencies.
let acceptedCount = 0;
export function configure(count) { acceptedCount = count; }
export function createChildTraceContext(parent, options) {
  return { ...parent, attributes: options.attributes };
}
export function normalizeCollection(collection) {
  return { ...collection, analyzedNodeIds: collection.analyzedNodeIds ?? [],
    errorCount: collection.errorCount ?? 0, exhausted: collection.exhausted ?? false,
    explorable: collection.explorable ?? false, nodeIds: collection.nodeIds ?? [],
    plannerRuns: collection.plannerRuns ?? 0, status: collection.status ?? 'active' };
}
export function graphCollections(graph) { return (graph.collections ?? []).map(normalizeCollection); }
export function collectionNodeIdsForGraph(collection) { return collection.nodeIds ?? []; }
export function collectionFrontier() { return 0; }
export function isCollectionInPhase() { return true; }
export function nodeById(graph, id) { return graph.nodes.find(node => node.id === id); }
export function updateGraphCollection(snapshot, id, patch, timestamp) {
  return { ...snapshot, updatedAt: timestamp, graph: { ...snapshot.graph,
    collections: graphCollections(snapshot.graph).map(collection => collection.collectionId === id
      ? normalizeCollection({ ...collection, ...patch, collectionId: id }) : collection) } };
}
export function upsertActivity(snapshot, activity, timestamp) {
  return { ...snapshot, updatedAt: timestamp,
    activities: [...snapshot.activities.filter(item => item.activityId !== activity.activityId), activity] };
}
export function addArtifact(snapshot, artifact, timestamp) {
  return { ...snapshot, updatedAt: timestamp, artifacts: [...snapshot.artifacts, artifact] };
}
export function compactWorkflowPayload(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
export function safeArtifactName(value) { return value; }
export function buildDefaultPlannerPrompt(_snapshot, _collection, phase) { return `phase=${phase}`; }
export function applyPlannerExpansion(snapshot, collection) {
  const addedNodes = Array.from({ length: acceptedCount }, (_, index) => ({ id: `accepted-${index}` }));
  return { addedEdges: [], addedNodes, collection,
    snapshot: { ...snapshot, graph: { ...snapshot.graph, nodes: addedNodes } } };
}
export async function exhaustCollection() { throw new Error('Unexpected exhaustion in focused fixture'); }
export async function emitExpansionEvents(snapshot, expansion, collectionId, options, runtime) {
  if (expansion.addedNodes.length) {
    await runtime.eventLog.emitEvent(snapshot, 'graph_expanded', {
      message: `Graph expanded for collection: ${collectionId}`,
      payload: { collectionId }, phase: options.phase, signal: options.abortSignal,
    });
  }
}
