import type { DatabaseSync } from "node:sqlite";
import type { ModelSelection } from "@knorvia/shared";

type RecordedChoice = {
  automation_id: string;
  model: string | null;
  provider: string | null;
  thought_level: string | null;
};

function decodeRecordedComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function convertRecordedChoice(row: RecordedChoice): ModelSelection | undefined {
  const legacyValue = row.model?.trim();
  if (!legacyValue) return undefined;

  let providerId = row.provider?.trim() ?? "";
  let modelId = legacyValue;
  let reasoningLevel = row.thought_level?.trim();

  if (legacyValue.startsWith("custom:")) {
    const body = legacyValue.slice(7);
    const separator = body.indexOf(":");
    if (separator < 0) return undefined;
    const pieces = body.split(":");
    if (pieces.length >= 3 && pieces[0] === "builtin") {
      providerId = "builtin:" + pieces[1];
      modelId = decodeRecordedComponent(pieces.slice(2).join(":"));
    } else {
      providerId = decodeRecordedComponent(body.slice(0, separator));
      modelId = decodeRecordedComponent(body.slice(separator + 1));
    }
  } else if (legacyValue.includes("/")) {
    const separator = legacyValue.indexOf("/");
    providerId = legacyValue.slice(0, separator);
    modelId = legacyValue.slice(separator + 1);
    const reasoningSeparator = modelId.indexOf("$");
    if (reasoningSeparator > 0 && reasoningSeparator < modelId.length - 1) {
      reasoningLevel = modelId.slice(reasoningSeparator + 1).trim();
      if (!reasoningLevel) return undefined;
      modelId = modelId.slice(0, reasoningSeparator);
    }
  } else if (providerId === "glm" || providerId === "knorvia") {
    return undefined;
  }

  providerId = providerId.trim();
  modelId = modelId.trim();
  if (!providerId || !modelId) return undefined;

  if (providerId.startsWith("builtin:")) {
    switch (providerId) {
      case "builtin:bigmodel":
        providerId = "bigmodel-api";
        break;
      case "builtin:zai":
        providerId = "zai-api";
        break;
      case "builtin:bigmodel-start-plan":
        providerId = "account:bigmodel-start-plan";
        break;
      case "builtin:zai-start-plan":
        providerId = "account:zai-start-plan";
        break;
      case "builtin:bigmodel-coding-plan":
        providerId = "account:bigmodel-individual-coding-plan";
        break;
      case "builtin:zai-coding-plan":
        providerId = "account:zai-individual-coding-plan";
        break;
      default:
        return undefined;
    }
  }

  const selection: ModelSelection = { providerId, modelId };
  if (reasoningLevel) selection.options = { reasoningLevel };
  return selection;
}

export function importLegacyAutomationSelections(db: DatabaseSync): void {
  const rows = db
    .prepare(
      "SELECT automation_id, model, provider, thought_level FROM automations WHERE model IS NOT NULL",
    )
    .all() as RecordedChoice[];

  for (const row of rows) {
    const selection = convertRecordedChoice(row);
    if (!selection) {
      if (row.model?.trim()) {
        db.prepare("UPDATE automations SET model_selection=NULL WHERE automation_id=?").run(
          row.automation_id,
        );
      }
      continue;
    }

    db.prepare(`UPDATE automations SET model_selection = ?
       WHERE automation_id = ?
         AND model IS ? AND provider IS ? AND thought_level IS ?`).run(
      JSON.stringify(selection),
      row.automation_id,
      row.model,
      row.provider,
      row.thought_level,
    );
  }

  db.exec(`UPDATE automations SET model_selection='null'
    WHERE model_selection IS NULL AND (model IS NULL OR trim(model)='')`);
}
