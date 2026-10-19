// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { CompileDiagnostic, ScriptLoc, WorkflowProgram } from "../compiler/compile.js";
import type { SiteTable } from "./sites.js";

// Diagnostic code for invalid phase() marker declarations.
export const PHASE_MARKER_CODE = 9004;

const NON_LITERAL_ARGUMENT_ERROR = [
  'phase()\'s argument must be a compile-time string literal ("gate" or a no-substitution template):',
  "the script's phase names are fixed when it is submitted, because they label the graph the user",
  "confirms before anything runs. Write the name inline — a name that only exists at run time cannot be drawn.",
].join(" ");

const BLANK_PHASE_NAME_ERROR = [
  'phase("") has no name to show: the phase label is what the confirmation graph draws.',
  'Give the group a word ("preflight", "gate", "wrap-up"), or drop the marker — a script',
  "with no markers is perfectly legal and is drawn step by step.",
].join(" ");

const STANDALONE_STATEMENT_REQUIRED_ERROR = [
  'phase("…") must stand alone as its own statement. The marker claims the rest of the block',
  "it stands in, so one in expression position (a variable initializer, an argument, a",
  "ternary arm) has no rest-of-block to claim. Put the call on its own line at the head of",
  "the steps it names.",
].join(" ");

// Evaluates phase markers to ensure constant naming and standalone expression statement positions.
export function collectPhaseMarkerDiagnostics(
  workflowProgram: WorkflowProgram,
  siteTable: SiteTable,
): CompileDiagnostic[] {
  const collected: CompileDiagnostic[] = [];

  const emit = (location: ScriptLoc, detailText: string): void => {
    collected.push({
      code: PHASE_MARKER_CODE,
      column: location.column,
      line: location.line,
      message: detailText,
    });
  };

  for (const marker of siteTable.phases) {
    const errorLoc = marker.nameExpr
      ? workflowProgram.toScriptLoc(marker.nameExpr.getStart(workflowProgram.scriptFile))
      : marker.loc;

    if (marker.name === undefined) {
      emit(errorLoc, NON_LITERAL_ARGUMENT_ERROR);
    } else if (marker.name.trim().length === 0) {
      emit(errorLoc, BLANK_PHASE_NAME_ERROR);
    }

    if (!ts.isExpressionStatement(marker.call.parent)) {
      emit(marker.loc, STANDALONE_STATEMENT_REQUIRED_ERROR);
    }
  }

  return collected;
}
