import type { StudioKernelOptions } from "../../kernelTypes.js";
import { list, record, text } from "../../domain/kernelPolicy.js";

// These commands change the terminal/session or duplicate Studio's own selectors.
// Sending them as a chat turn could desynchronize the persisted Studio conversation.
const STUDIO_CONTROL_COMMANDS = new Set([
  "clear",
  "reset",
  "new",
  "exit",
  "quit",
  "resume",
  "rename",
  "name",
  "model",
  "effort",
  "config",
  "settings",
  "permissions",
  "fast",
  "color",
  "login",
  "logout",
  "mcp",
  "doctor",
  "usage",
  "cost",
  "stats",
  "context",
]);

/** Claude's initialize control response advertises the current project's real command catalog. */
export function claudeAvailableCommands(
  initialized: Record<string, unknown>,
): NonNullable<StudioKernelOptions["commands"]> {
  const terminal = new Set(
    list(initialized.terminal_slash_commands).map((item) =>
      typeof item === "string" ? item : text(record(item).name),
    ),
  );
  return list(initialized.commands)
    .slice(0, 256)
    .flatMap((value) => {
      const command = record(value);
      const name = text(command.name).replace(/^\/+/, "");
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(name) ||
        terminal.has(name) ||
        STUDIO_CONTROL_COMMANDS.has(name)
      )
        return [];
      return [
        {
          name,
          description: text(command.description).slice(0, 500),
          ...(text(command.argumentHint)
            ? { inputHint: text(command.argumentHint).slice(0, 160) }
            : {}),
        },
      ];
    });
}
