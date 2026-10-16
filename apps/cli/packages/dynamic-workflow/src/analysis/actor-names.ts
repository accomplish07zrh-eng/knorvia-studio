// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { CompileDiagnostic, WorkflowProgram } from "../compiler/compile.js";
import type { SiteTable } from "./sites.js";

const DUPLICATE_ACTOR_NAME_CODE = 9005;
export const FANOUT_ACTOR_NAME_CODE = 9006;

function formatFanOutStaticActorNameError(actorLabel: string): string {
  return [
    `this agent(...) runs once per element of a fan-out but its name "${actorLabel}" is a fixed string,`,
    "so every element creates a different actor under the same name — the run fails with DuplicateActorName",
    "as soon as the collection holds more than one item. An actor name must be unique within a run:",
    "it is the identity key an amended re-run matches its imported cache against.",
    `Build a per-element name (\`${actorLabel}-\${item}\`), or drop the name — anonymous actors are legal`,
    "(they just never reuse cached work).",
  ].join(" ");
}

function formatDuplicateActorNameError(actorLabel: string, initialLine: number): string {
  return [
    `two actors are named "${actorLabel}" (the first is on line ${initialLine}): an actor name must be unique within a run.`,
    "The name is the identity key an amended re-run matches its imported cache against, and any run can become the predecessor",
    "of one, so a repeated name makes that match ambiguous. Give this one its own name, or drop the name entirely — anonymous",
    "actors are legal (they just never reuse cached work).",
  ].join(" ");
}

export function collectDuplicateActorNames(
  workflowProgram: WorkflowProgram,
  siteTable: SiteTable,
): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  const registeredActorClaims = new Map<string, ts.CallExpression>();
  const iterationBodyNodes = new Set<ts.Node>(
    siteTable.iterations.map((candidate) => candidate.body),
  );

  for (const actorSite of siteTable.actors) {
    const identifiedName = extractStaticActorName(actorSite.call);
    if (!identifiedName) continue;

    const priorClaim = registeredActorClaims.get(identifiedName);
    if (!priorClaim) {
      registeredActorClaims.set(identifiedName, actorSite.call);
    }

    const currentLoc = workflowProgram.toScriptLoc(
      actorSite.call.getStart(workflowProgram.scriptFile),
    );

    if (isNestedWithinFanOut(actorSite.call, iterationBodyNodes)) {
      diagnostics.push({
        code: FANOUT_ACTOR_NAME_CODE,
        column: currentLoc.column,
        line: currentLoc.line,
        message: formatFanOutStaticActorNameError(identifiedName),
      });
      continue;
    }

    if (priorClaim) {
      const priorLoc = workflowProgram.toScriptLoc(priorClaim.getStart(workflowProgram.scriptFile));
      diagnostics.push({
        code: DUPLICATE_ACTOR_NAME_CODE,
        column: currentLoc.column,
        line: currentLoc.line,
        message: formatDuplicateActorNameError(identifiedName, priorLoc.line),
      });
    }
  }

  return diagnostics;
}

function isNestedWithinFanOut(
  callNode: ts.CallExpression,
  iterationBodies: ReadonlySet<ts.Node>,
): boolean {
  let ancestor: ts.Node | undefined = callNode;
  while (ancestor !== undefined) {
    if (iterationBodies.has(ancestor)) return true;
    ancestor = ancestor.parent;
  }
  return false;
}

function extractStaticActorName(call: ts.CallExpression): string | undefined {
  const [firstArg, secondArg] = call.arguments;

  if (secondArg && !ts.isStringLiteralLike(secondArg)) {
    if (!ts.isObjectLiteralExpression(secondArg)) return void 0;

    for (const prop of secondArg.properties) {
      if (ts.isSpreadAssignment(prop)) return void 0;
      if (prop.name && ts.isComputedPropertyName(prop.name)) return void 0;

      const propNameIdentifier = prop.name;
      const isNameProperty =
        propNameIdentifier &&
        (ts.isIdentifier(propNameIdentifier) || ts.isStringLiteralLike(propNameIdentifier)) &&
        propNameIdentifier.text === "name";

      if (!isNameProperty) continue;
      if (!ts.isPropertyAssignment(prop)) return void 0;

      return ts.isStringLiteralLike(prop.initializer) ? prop.initializer.text : void 0;
    }
  }

  return firstArg && ts.isStringLiteralLike(firstArg) ? firstArg.text : void 0;
}
