import { createHash } from "node:crypto";
import { BOOTSTRAP_ONCE, bootstrapScopes, workspace, taskNode, colors } from "./model.js";
import type { TaskRow, TaskScope } from "./model.js";
import { SQL } from "./sql.js";
import { Store } from "./store.js";
export function bootstrap(store: Store, scopes: TaskScope[], active: TaskRow[]): void {
  const eligible = bootstrapScopes(scopes);
  if (!eligible.length || store.get(SQL.bootstrapped)) return;
  const byWorkspace = new Map<string, TaskRow[]>();
  for (const row of active) {
    const bucket = byWorkspace.get(row.workspace_key) ?? [];
    bucket.push(row);
    byWorkspace.set(row.workspace_key, bucket);
  }
  const now = Date.now(),
    marker = store.database().prepare(SQL.marker);
  if (!byWorkspace.size) {
    marker.run(BOOTSTRAP_ONCE, now, now);
    return;
  }
  const ordered = new Set(
    store.all<{ node_key: string }>(SQL.groupOrderKeys).map((row) => row.node_key),
  );
  let maximum = store.get<{ max_sort_order: number | null }>(SQL.maximum)?.max_sort_order ?? 0;
  const group = store.database().prepare(SQL.bootstrapGroup),
    order = store.database().prepare(SQL.bootstrapOrder);
  const removeMember = store.database().prepare(SQL.bootstrapRemoveMember),
    member = store.database().prepare(SQL.bootstrapMember);
  const removeOrder = store.database().prepare(SQL.bootstrapRemoveOrder),
    workspaceMarker = store.database().prepare(SQL.workspaceMarker);
  store.transaction(() => {
    marker.run(BOOTSTRAP_ONCE, now, now);
    for (const scope of eligible) {
      const key = workspace(scope),
        rows = byWorkspace.get(key);
      if (!rows?.length) continue;
      rows.sort(
        (a, b) =>
          b.updated_at - a.updated_at ||
          b.created_at - a.created_at ||
          a.task_id.localeCompare(b.task_id),
      );
      const hash = createHash("sha256").update(key).digest("hex"),
        id = "workspace-group-" + hash.slice(0, 24);
      const stripped = scope.workspacePath.replace(/[\\/]+$/, ""),
        segments = stripped.split(/[\\/]/).filter(Boolean);
      const title = segments[segments.length - 1]?.trim() || stripped.trim() || "Workspace";
      const color = colors[1 + (parseInt(hash.slice(0, 2), 16) % 6)] ?? "gray";
      group.run(id, title, color, now, now);
      if (!ordered.has(id)) {
        maximum += 1000;
        order.run(id, maximum, now, now);
        ordered.add(id);
      }
      rows.forEach((row, index) => {
        removeMember.run(row.workspace_key, row.task_id);
        member.run(
          id,
          row.workspace_key,
          row.workspace_path,
          row.workspace_identity,
          row.task_id,
          (index + 1) * 1000,
          now,
          now,
          now,
        );
        removeOrder.run(
          taskNode(
            workspace({
              workspacePath: row.workspace_path,
              workspaceIdentity: row.workspace_identity ?? undefined,
            }),
            row.task_id,
          ),
        );
      });
      workspaceMarker.run(key, id, now, now);
    }
    store.exec(SQL.emptyGroups);
    store.exec(SQL.danglingGroups);
  });
}
