import type { StudioCommand, StudioCommandResult } from "../contract.js";
import { canonicalStudioValue } from "../domain/canonicalValue.js";
import { validateStudioCommand } from "../domain/validation.js";
import type { StudioClock, StudioRepository } from "./storePort.js";

/** Existing admission path, also usable in an owned task's atomic dispatch transaction. */
export function admitStudioCommandReceipt(
  db: StudioRepository,
  clock: StudioClock,
  command: StudioCommand,
  apply: (db: StudioRepository, clock: StudioClock, command: StudioCommand) => string,
): StudioCommandResult {
  validateStudioCommand(command);
  const payload = canonicalStudioValue(command);
  const previous = db.read<{ payload: string; result: StudioCommandResult }>(
    "command",
    command.commandId,
  );
  if (previous) {
    if (previous.payload !== payload) throw new Error("同一请求编号不能提交不同操作");
    return previous.result;
  }
  const id = apply(db, clock, command);
  const result = { id, revision: db.revision() + 1 };
  db.write("command", command.commandId, { payload, result });
  return result;
}
