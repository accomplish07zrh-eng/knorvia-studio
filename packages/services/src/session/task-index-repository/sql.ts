// Fixed SQL data retained from the authorized task-sql-data.json packet.
export const SQL = {
  busy: ["PRAGMA busy_timeout = ", ""],
  foreign: "PRAGMA foreign_keys = ON",
  wal: "PRAGMA journal_mode = WAL",
  normal: "PRAGMA synchronous = NORMAL",
  legacyExists: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'off_peak_tasks'",
  legacyBackfill:
    "UPDATE tasks SET off_peak_task_id = (\n          SELECT o.off_peak_task_id FROM off_peak_tasks o\n          WHERE o.session_id = tasks.task_id AND o.workspace_key = tasks.workspace_key\n        )\n        WHERE off_peak_task_id IS NULL\n          AND EXISTS (\n            SELECT 1 FROM off_peak_tasks o\n            WHERE o.session_id = tasks.task_id AND o.workspace_key = tasks.workspace_key\n          )",
  offPeakRows:
    "SELECT workspace_key, workspace_path, workspace_identity, task_id FROM tasks\n         WHERE off_peak_task_id IS NOT NULL AND deleted = 0",
  removeMember: "DELETE FROM task_group_members\n        WHERE workspace_key = ? AND task_id = ?",
  removeTaskOrder:
    "DELETE FROM task_group_view_node_orders\n        WHERE node_type = 'task' AND (node_key = ? OR node_key = ?)",
  deletedRows: "SELECT workspace_key, task_id\n        FROM tasks\n        WHERE deleted = 1",
  begin: "BEGIN IMMEDIATE",
  commit: "COMMIT",
  rollback: "ROLLBACK",
  task: "SELECT\n          workspace_key,\n          workspace_path,\n          workspace_identity,\n          task_id,\n          title,\n          task_status,\n          provider,\n          mode,\n          model,\n          migration_source,\n          forked_from_task_id,\n          cron_automation_id,\n          off_peak_task_id,\n          created_at,\n          updated_at,\n          unread_at,\n          last_unread_at,\n          pinned,\n          archived,\n          deleted,\n          title_overridden,\n          searchable_text,\n          meta_json\n        FROM tasks\n        WHERE workspace_key = ? AND task_id = ?",
  minimum: "SELECT MIN(sort_order) AS min_sort_order\n        FROM task_group_view_node_orders",
  upsertOrder:
    "INSERT INTO task_group_view_node_orders (\n          node_type,\n          node_key,\n          sort_order,\n          created_at,\n          updated_at\n        ) VALUES (?, ?, ?, ?, ?)\n        ON CONFLICT(node_type, node_key) DO UPDATE SET\n          sort_order = excluded.sort_order,\n          updated_at = excluded.updated_at",
  maximum: "SELECT MAX(sort_order) AS max_sort_order\n        FROM task_group_view_node_orders",
  normalizeOrder:
    "INSERT INTO task_group_view_node_orders (\n        node_type,\n        node_key,\n        sort_order,\n        created_at,\n        updated_at\n      ) VALUES (?, ?, ?, ?, ?)",
  memberMaximum:
    "SELECT MAX(sort_order) AS max_sort_order\n        FROM task_group_members\n        WHERE group_id = ?",
  normalizeMember:
    "UPDATE task_group_members\n      SET sort_order = ?, updated_at = ?\n      WHERE workspace_key = ? AND task_id = ?",
  stale: [
    "SELECT\n          workspace_key,\n          workspace_path,\n          workspace_identity,\n          task_id,\n          title,\n          task_status,\n          provider,\n          mode,\n          model,\n          migration_source,\n          forked_from_task_id,\n          cron_automation_id,\n          off_peak_task_id,\n          created_at,\n          updated_at,\n          unread_at,\n          last_unread_at,\n          pinned,\n          archived,\n          deleted,\n          title_overridden,\n          searchable_text,\n          meta_json\n        FROM tasks\n        WHERE ",
    "\n        ORDER BY updated_at DESC, created_at DESC, task_id DESC",
  ],
  archive: "UPDATE tasks\n      SET archived = 1\n      WHERE workspace_key = ? AND task_id = ?",
  bootstrapped: "SELECT 1 AS found\n        FROM task_group_workspace_bootstraps\n        LIMIT 1",
  marker:
    "INSERT INTO task_group_workspace_bootstraps (\n        workspace_key,\n        group_id,\n        created_at,\n        updated_at\n      ) VALUES (?, NULL, ?, ?)\n      ON CONFLICT(workspace_key) DO UPDATE SET\n        updated_at = excluded.updated_at",
  groupOrderKeys:
    "SELECT node_key\n            FROM task_group_view_node_orders\n            WHERE node_type = 'group'",
  bootstrapGroup:
    "INSERT OR IGNORE INTO task_groups (\n        group_id,\n        title,\n        color,\n        created_at,\n        updated_at\n      ) VALUES (?, ?, ?, ?, ?)",
  bootstrapOrder:
    "INSERT OR IGNORE INTO task_group_view_node_orders (\n        node_type,\n        node_key,\n        sort_order,\n        created_at,\n        updated_at\n      ) VALUES ('group', ?, ?, ?, ?)",
  bootstrapRemoveMember:
    "DELETE FROM task_group_members\n      WHERE workspace_key = ? AND task_id = ?",
  bootstrapMember:
    "INSERT INTO task_group_members (\n        group_id,\n        workspace_key,\n        workspace_path,\n        workspace_identity,\n        task_id,\n        sort_order,\n        added_at,\n        created_at,\n        updated_at\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ON CONFLICT(workspace_key, task_id) DO UPDATE SET\n        group_id = excluded.group_id,\n        workspace_path = excluded.workspace_path,\n        workspace_identity = excluded.workspace_identity,\n        sort_order = excluded.sort_order,\n        updated_at = excluded.updated_at",
  bootstrapRemoveOrder:
    "DELETE FROM task_group_view_node_orders\n      WHERE node_type = 'task' AND node_key = ?",
  workspaceMarker:
    "INSERT INTO task_group_workspace_bootstraps (\n        workspace_key,\n        group_id,\n        created_at,\n        updated_at\n      ) VALUES (?, ?, ?, ?)\n      ON CONFLICT(workspace_key) DO UPDATE SET\n        group_id = excluded.group_id,\n        updated_at = excluded.updated_at",
  emptyGroups:
    "DELETE FROM task_groups\n      WHERE group_id NOT IN (\n        SELECT DISTINCT group_id\n        FROM task_group_members\n      )",
  danglingGroups:
    "DELETE FROM task_group_view_node_orders\n      WHERE node_type = 'group'\n        AND node_key NOT IN (\n          SELECT group_id\n          FROM task_groups\n        )",
  writeTask:
    "INSERT INTO tasks (\n          workspace_key,\n          workspace_path,\n          workspace_identity,\n          task_id,\n          title,\n          task_status,\n          provider,\n          mode,\n          model,\n          migration_source,\n          forked_from_task_id,\n          cron_automation_id,\n          off_peak_task_id,\n          created_at,\n          updated_at,\n          unread_at,\n          last_unread_at,\n          pinned,\n          archived,\n          deleted,\n          title_overridden,\n          searchable_text,\n          meta_json\n        ) VALUES (\n          @workspace_key,\n          @workspace_path,\n          @workspace_identity,\n          @task_id,\n          @title,\n          @task_status,\n          @provider,\n          @mode,\n          @model,\n          @migration_source,\n          @forked_from_task_id,\n          @cron_automation_id,\n          @off_peak_task_id,\n          @created_at,\n          @updated_at,\n          @unread_at,\n          @last_unread_at,\n          @pinned,\n          @archived,\n          @deleted,\n          @title_overridden,\n          @searchable_text,\n          @meta_json\n        )\n        ON CONFLICT(workspace_key, task_id) DO UPDATE SET\n          workspace_path = excluded.workspace_path,\n          workspace_identity = excluded.workspace_identity,\n          title = excluded.title,\n          task_status = excluded.task_status,\n          provider = excluded.provider,\n          mode = excluded.mode,\n          model = excluded.model,\n          migration_source = excluded.migration_source,\n          forked_from_task_id = excluded.forked_from_task_id,\n          cron_automation_id = excluded.cron_automation_id,\n          off_peak_task_id = excluded.off_peak_task_id,\n          created_at = excluded.created_at,\n          updated_at = excluded.updated_at,\n          unread_at = CASE\n            WHEN @write_unread_at = 1 THEN excluded.unread_at\n            ELSE tasks.unread_at\n          END,\n          last_unread_at = MAX(\n            tasks.last_unread_at,\n            COALESCE(tasks.unread_at, 0),\n            CASE WHEN @write_unread_at = 1 THEN excluded.last_unread_at ELSE 0 END\n          ),\n          pinned = excluded.pinned,\n          archived = excluded.archived,\n          deleted = excluded.deleted,\n          title_overridden = excluded.title_overridden,\n          searchable_text = excluded.searchable_text,\n          meta_json = excluded.meta_json",
  systemGroup:
    "INSERT OR IGNORE INTO task_groups (group_id, title, color, created_at, updated_at)\n        VALUES (?, ?, ?, ?, ?)",
  systemOrder:
    "INSERT OR IGNORE INTO task_group_view_node_orders (node_type, node_key, sort_order, created_at, updated_at)\n        VALUES ('group', ?, ?, ?, ?)",
  systemMember:
    "INSERT OR IGNORE INTO task_group_members (\n          group_id,\n          workspace_key,\n          workspace_path,\n          workspace_identity,\n          task_id,\n          sort_order,\n          added_at,\n          created_at,\n          updated_at\n        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)",
  list: "SELECT\n          workspace_key,\n          workspace_path,\n          workspace_identity,\n          task_id,\n          title,\n          task_status,\n          provider,\n          mode,\n          model,\n          migration_source,\n          forked_from_task_id,\n          cron_automation_id,\n          off_peak_task_id,\n          created_at,\n          updated_at,\n          unread_at,\n          pinned,\n          archived,\n          deleted,\n          title_overridden,\n          searchable_text,\n          meta_json\n        FROM tasks\n        WHERE (@workspace_key IS NULL OR workspace_key = @workspace_key)\n          AND (@include_deleted = 1 OR deleted = 0)\n          -- 按请求指定的 runtime provider 过滤；迁移来源另存于 migration_source。\n          AND (@provider IS NULL OR provider = @provider)\n          AND (@pinned IS NULL OR pinned = @pinned)\n          AND (@archived IS NULL OR archived = @archived)\n        ORDER BY updated_at DESC, created_at DESC, task_id DESC",
  deletedIds:
    "SELECT task_id\n        FROM tasks\n        WHERE workspace_key = @workspace_key\n          AND deleted = 1\n          AND (@provider IS NULL OR provider = @provider)\n        ORDER BY task_id",
  automation:
    "SELECT\n          workspace_key,\n          workspace_path,\n          workspace_identity,\n          task_id,\n          title,\n          task_status,\n          provider,\n          mode,\n          model,\n          migration_source,\n          forked_from_task_id,\n          cron_automation_id,\n          off_peak_task_id,\n          created_at,\n          updated_at,\n          unread_at,\n          pinned,\n          archived,\n          deleted,\n          title_overridden,\n          searchable_text,\n          meta_json\n        FROM tasks\n        WHERE cron_automation_id = @automation_id\n          AND deleted = 0\n        ORDER BY created_at DESC, task_id DESC",
  count: ["SELECT COUNT(1) AS total FROM tasks WHERE ", ""],
  query: [
    "SELECT\n          workspace_key,\n          workspace_path,\n          workspace_identity,\n          task_id,\n          title,\n          task_status,\n          provider,\n          mode,\n          model,\n          migration_source,\n          forked_from_task_id,\n          cron_automation_id,\n          off_peak_task_id,\n          created_at,\n          updated_at,\n          unread_at,\n          pinned,\n          archived,\n          deleted,\n          title_overridden,\n          searchable_text,\n          meta_json\n        FROM tasks\n        WHERE ",
    "\n        ORDER BY ",
    "",
    "",
  ],
  createGroup:
    "INSERT INTO task_groups (\n          group_id,\n          title,\n          color,\n          created_at,\n          updated_at\n        ) VALUES (?, ?, ?, ?, ?)",
  renameGroup:
    "UPDATE task_groups\n        SET title = ?, updated_at = ?\n        WHERE group_id = ?",
  group:
    "SELECT\n          group_id,\n          title,\n          color,\n          created_at,\n          updated_at\n        FROM task_groups\n        WHERE group_id = ?",
  colorGroup:
    "UPDATE task_groups\n        SET color = ?, updated_at = ?\n        WHERE group_id = ?",
  deleteGroup: "DELETE FROM task_groups WHERE group_id = ?",
  deleteGroupOrder:
    "DELETE FROM task_group_view_node_orders\n          WHERE node_type = 'group' AND node_key = ?",
  hasMember:
    "SELECT 1 AS found\n        FROM task_group_members\n        WHERE workspace_key = ? AND task_id = ?\n        LIMIT 1",
  hasTaskOrder:
    "SELECT 1 AS found\n        FROM task_group_view_node_orders\n        WHERE node_type = 'task' AND node_key = ?\n        LIMIT 1",
  active: [
    "SELECT\n                workspace_key,\n                workspace_path,\n                workspace_identity,\n                task_id,\n                title,\n                task_status,\n                provider,\n                mode,\n                model,\n                migration_source,\n                forked_from_task_id,\n                cron_automation_id,\n                created_at,\n                updated_at,\n                unread_at,\n                pinned,\n                archived,\n                deleted,\n                title_overridden,\n                searchable_text,\n                meta_json\n              FROM tasks\n              WHERE ",
    "",
  ],
  bootstrapGroups:
    "SELECT workspace_key, group_id\n        FROM task_group_workspace_bootstraps\n        WHERE group_id IS NOT NULL",
  groups:
    "SELECT\n          group_id,\n          title,\n          color,\n          created_at,\n          updated_at\n        FROM task_groups",
  members:
    "SELECT\n          group_id,\n          workspace_key,\n          workspace_path,\n          workspace_identity,\n          task_id,\n          sort_order,\n          added_at,\n          created_at,\n          updated_at\n        FROM task_group_members",
  orders:
    "SELECT\n          node_type,\n          node_key,\n          sort_order,\n          created_at,\n          updated_at\n        FROM task_group_view_node_orders",
  groupIds: "SELECT group_id FROM task_groups",
  scopeTasks: [
    "SELECT workspace_key, task_id\n              FROM tasks\n              WHERE workspace_key IN (",
    ")",
  ],
  orderMarker:
    "INSERT INTO task_group_workspace_bootstraps (\n          workspace_key,\n          group_id,\n          created_at,\n          updated_at\n        ) VALUES (?, NULL, ?, ?)\n        ON CONFLICT(workspace_key) DO UPDATE SET\n          updated_at = excluded.updated_at",
  orderMember:
    "INSERT INTO task_group_members (\n          group_id,\n          workspace_key,\n          workspace_path,\n          workspace_identity,\n          task_id,\n          sort_order,\n          added_at,\n          created_at,\n          updated_at\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\n        ON CONFLICT(workspace_key, task_id) DO UPDATE SET\n          group_id = excluded.group_id,\n          workspace_path = excluded.workspace_path,\n          workspace_identity = excluded.workspace_identity,\n          sort_order = excluded.sort_order,\n          updated_at = excluded.updated_at",
  removeAllGroupOrders: "DELETE FROM task_group_view_node_orders WHERE node_type = 'group'",
  insertOrder:
    "INSERT INTO task_group_view_node_orders (\n          node_type,\n          node_key,\n          sort_order,\n          created_at,\n          updated_at\n        ) VALUES (?, ?, ?, ?, ?)",
} as const;
export function fill(parts: readonly string[], ...slots: string[]): string {
  return parts.reduce((text, part, index) => text + part + (slots[index] ?? ""), "");
}
