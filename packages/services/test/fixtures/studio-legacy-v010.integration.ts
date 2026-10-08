import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

/** 用旧版真实 DDL 建库，避免由新构造器建空库而伪称旧数据迁移已验证。 */
export async function seedLegacyStudioDatabase(path: string, workspacePath: string) {
  const db = new DatabaseSync(path);
  try {
    db.exec(
      await readFile(new URL("./studio-v010-schema.integration.sql", import.meta.url), "utf8"),
    );
    const rows = [
      {
        kind: "conversation",
        id: "legacy-chat",
        scope: "",
        value: {
          id: "legacy-chat",
          kernel: "codex",
          workspacePath,
          title: "旧会话保留",
          nativeSessionId: "native-root-current",
          createdAt: 11,
          updatedAt: 12,
          legacyUnknown: { preserve: true },
        },
      },
      {
        kind: "run",
        id: "legacy-run",
        scope: "legacy-chat",
        value: {
          id: "legacy-run",
          kind: "chat",
          targetId: "legacy-chat",
          input: "旧纯文字输入",
          state: "succeeded",
          attempt: 1,
          resultKnown: true,
          checkpoint: { steps: {}, values: {}, completedRounds: 0 },
          createdAt: 11,
          updatedAt: 12,
          legacyUnknown: ["保留旧字段"],
        },
      },
      {
        kind: "message",
        id: "legacy-message",
        scope: "legacy-chat",
        value: {
          id: "legacy-message",
          runId: "legacy-run",
          targetId: "legacy-chat",
          kind: "text",
          sender: "user",
          text: "旧正文保留",
          createdAt: 11,
          legacyUnknown: "保留原字节",
        },
      },
      {
        kind: "command",
        id: "legacy-command",
        scope: "",
        value: { id: "legacy-run", revision: 23 },
      },
    ].map((row, index) => ({
      ...row,
      value: JSON.stringify(row.value, null, 2),
      sequence: index + 1,
    }));
    const insert = db.prepare("INSERT INTO studio_entities VALUES (?,?,?,?,?)");
    for (const row of rows) insert.run(row.kind, row.id, row.scope, row.value, row.sequence);
    const schema = db
      .prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
      .all();
    return { rows, schema };
  } finally {
    db.close();
  }
}
