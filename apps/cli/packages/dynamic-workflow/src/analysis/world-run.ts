// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { CompileDiagnostic, WorkflowProgram } from "../compiler/compile.js";
import type { SiteTable } from "./sites.js";

// Diagnostic code emitted when world.run has a non-literal command argument.
export const WORLD_RUN_LITERAL_CODE = 9003;

// Collected commands and compile diagnostics for world.run invocations.
export interface WorldRunCommands {
  readonly commands: string[];
  readonly diagnostics: CompileDiagnostic[];
}

const LITERAL_COMMAND_REQUIRED_MESSAGE = [
  'world.run\'s first argument must be a compile-time string literal ("lean" or a no-substitution template):',
  "the script's command set is shown to the user at confirmation and only those commands are executable.",
  "Move the command name out of the variable/template, and put runtime values in the args array instead.",
].join(" ");

// Extracts unique statically-known commands executed via world.run.
export function collectWorldRunCommands(
  workflowProgram: WorkflowProgram,
  siteTable: SiteTable,
): WorldRunCommands {
  const discoveredCommands = new Set<string>();
  const reportedDiagnostics: CompileDiagnostic[] = [];

  for (const site of siteTable.worldReads) {
    if (site.op === "run") {
      const commandExpr = site.args[0];
      if (commandExpr && ts.isStringLiteralLike(commandExpr)) {
        discoveredCommands.add(commandExpr.text);
      } else {
        const errorLocation = commandExpr
          ? workflowProgram.toScriptLoc(commandExpr.getStart())
          : site.loc;

        reportedDiagnostics.push({
          code: WORLD_RUN_LITERAL_CODE,
          column: errorLocation.column,
          line: errorLocation.line,
          message: LITERAL_COMMAND_REQUIRED_MESSAGE,
        });
      }
    }
  }

  const sortedUniqueCommands = Array.from(discoveredCommands).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return {
    commands: sortedUniqueCommands,
    diagnostics: reportedDiagnostics,
  };
}
