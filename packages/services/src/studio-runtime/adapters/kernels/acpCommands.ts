import type { StudioKernelOptions } from "../../kernelTypes.js";
import { list, record, text } from "../../domain/kernelPolicy.js";

/** ACP commands are session-scoped facts; never derive them from another CLI's UI catalog. */
export function acpAvailableCommands(
  message: Record<string, unknown>,
  sessionId: string,
): NonNullable<StudioKernelOptions["commands"]> | null {
  if (message.method !== "session/update") return null;
  const params = record(message.params);
  if (params.sessionId !== sessionId) return null;
  const update = record(params.update);
  if (update.sessionUpdate !== "available_commands_update") return null;
  return list(update.availableCommands)
    .slice(0, 128)
    .flatMap((value) => {
      const command = record(value);
      const name = text(command.name).replace(/^\/+/, "");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(name)) return [];
      return [
        {
          name,
          description: text(command.description).slice(0, 500),
          ...(text(record(command.input).hint)
            ? { inputHint: text(record(command.input).hint).slice(0, 160) }
            : {}),
        },
      ];
    });
}
