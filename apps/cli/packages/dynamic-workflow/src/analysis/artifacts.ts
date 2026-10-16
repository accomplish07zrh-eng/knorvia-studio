// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import type { CompileDiagnostic, ScriptLoc, WorkflowProgram } from "../compiler/compile.js";
import { ARTIFACT_CAPS, ARTIFACT_ID_PATTERN } from "../facade/artifact-caps.js";
import { isArtifactPresetOp, type ArtifactOp } from "../facade/registry.js";
import { findWorkflowBody, type ArtifactSite, type SiteTable } from "./sites.js";

export const ARTIFACT_DECLARATION_CODE = 9007;
export const ARTIFACT_HOISTING_CODE = 9008;
export const ARTIFACT_PRIMARY_CONFLICT_CODE = 9009;

export interface DeclaredArtifact {
  readonly id: string;
  readonly kind: ArtifactOp;
}

export interface ArtifactDeclarations {
  readonly declaredArtifacts: DeclaredArtifact[];
  readonly diagnostics: CompileDiagnostic[];
}

type HoistingContext = "loop" | "callback" | "conditional";

const HOISTING_EXPLANATIONS: Record<HoistingContext, string> = {
  callback: [
    "a preset artifact declared inside a callback: hoist it to the top level and declare it once.",
    "A preset is a declaration, not a step — it says how the items tagged with its id are drawn,",
    "and the tagged report() calls are what fill it in. Declaring it where the callback runs",
    'buries it: move artifact.<kind>("<id>", spec) to the head of the script and keep only',
    'report(item, "<id>") in the callback.',
  ].join(" "),
  conditional: [
    "a preset artifact declared inside a conditional branch: hoist it to the top level and declare",
    "it once. The card should exist from the moment the run starts (it is legitimately empty until",
    "the first tagged report arrives), and a declaration that may or may not have run is a card",
    "that may or may not exist. Declare it unconditionally and let the branch decide what to report.",
  ].join(" "),
  loop: [
    "a preset artifact declared inside a loop: hoist it to the top level and declare it once.",
    'A preset is declared once and fed many times — the loop body is where report(item, "<id>")',
    "belongs, not the declaration. Re-declaring the same spec is a no-op, but re-declaring it with",
    "a different spec fails the whole run, so the loop is the wrong place for it either way.",
  ].join(" "),
};

const INVALID_NON_LITERAL_ID_ERROR = [
  'an artifact id must be a compile-time string literal ("report" or a no-substitution template):',
  "the set of artifacts a run can publish is fixed when the script is submitted, so it can be listed",
  "before anything runs. Write the id inline; put the runtime value in the title instead",
  '(artifact.file("report", path, { title: `Report for ${name}` })).',
].join(" ");

const BLANK_ARTIFACT_ID_ERROR = [
  "an artifact id must not be empty: it is the identity the card, the version history and the",
  'report tag all key off. Give it a short stable name ("book", "perf", "coverage").',
].join(" ");

export function collectArtifactDeclarations(
  workflowProgram: WorkflowProgram,
  siteTable: SiteTable,
): ArtifactDeclarations {
  const issues: CompileDiagnostic[] = [];
  const scriptAst = workflowProgram.scriptFile;
  const rootBlock = findWorkflowBody(scriptAst);

  const pushDiagnostic = (errCode: number, errorLoc: ScriptLoc, messageContent: string): void => {
    issues.push({
      code: errCode,
      column: errorLoc.column,
      line: errorLoc.line,
      message: messageContent,
    });
  };

  const nodeLocation = (n: ts.Node): ScriptLoc =>
    workflowProgram.toScriptLoc(n.getStart(scriptAst));

  const initialArtifactClaims = new Map<string, ArtifactSite>();
  let primaryMarkerClaim: { id: string; site: ArtifactSite } | undefined;
  const collectedArtifacts: DeclaredArtifact[] = [];

  for (const artifactSite of siteTable.artifacts) {
    const errorLocation = artifactSite.artifactIdExpr
      ? nodeLocation(artifactSite.artifactIdExpr)
      : artifactSite.loc;

    if (artifactSite.artifactId === undefined) {
      pushDiagnostic(ARTIFACT_DECLARATION_CODE, errorLocation, INVALID_NON_LITERAL_ID_ERROR);
      continue;
    }

    const currentId = artifactSite.artifactId;
    if (currentId.length === 0) {
      pushDiagnostic(ARTIFACT_DECLARATION_CODE, errorLocation, BLANK_ARTIFACT_ID_ERROR);
      continue;
    }

    if (currentId.length > ARTIFACT_CAPS.maxIdLength) {
      pushDiagnostic(
        ARTIFACT_DECLARATION_CODE,
        errorLocation,
        `artifact id "${currentId}" is ${currentId.length} characters; the limit is ${ARTIFACT_CAPS.maxIdLength}. ` +
          "The id is a key, not a description — put the prose in the title.",
      );
      continue;
    }

    if (!ARTIFACT_ID_PATTERN.test(currentId)) {
      pushDiagnostic(
        ARTIFACT_DECLARATION_CODE,
        errorLocation,
        `artifact id "${currentId}" contains characters outside [A-Za-z0-9_.-]. The id is carried verbatim ` +
          "through the journal, the artifact store and the side pane, so it is restricted to " +
          'characters that need no escaping anywhere ("build-log", "perf.p95").',
      );
      continue;
    }

    const previousClaim = initialArtifactClaims.get(currentId);
    if (!previousClaim) {
      initialArtifactClaims.set(currentId, artifactSite);
      collectedArtifacts.push({ id: currentId, kind: artifactSite.op });
    } else if (previousClaim.op !== artifactSite.op) {
      pushDiagnostic(
        ARTIFACT_DECLARATION_CODE,
        artifactSite.loc,
        `artifact id "${currentId}" is used with two different kinds: artifact.${previousClaim.op} on line ` +
          `${previousClaim.loc.line} and artifact.${artifactSite.op} here. Within one run an id belongs to exactly ` +
          "one kind — publishing it again is what mints the next VERSION, and a version cannot " +
          "change what the thing is. Give this one its own id.",
      );
    }

    const primaryProp = findPrimaryTrueLiteral(artifactSite);
    if (primaryProp !== undefined) {
      if (!primaryMarkerClaim) {
        primaryMarkerClaim = { id: currentId, site: artifactSite };
      } else if (primaryMarkerClaim.id !== currentId) {
        pushDiagnostic(
          ARTIFACT_PRIMARY_CONFLICT_CODE,
          nodeLocation(primaryProp),
          `artifact "${currentId}" is marked primary, but "${primaryMarkerClaim.id}" already is (artifact.` +
            `${primaryMarkerClaim.site.op} on line ${primaryMarkerClaim.site.loc.line}). A run has one ` +
            "deliverable — the card and the run pane lead with it. Drop primary from one of them, " +
            "or publish this content as a new version of the other id.",
        );
      }
    }

    if (isArtifactPresetOp(artifactSite.op)) {
      const lexicalContext = determineHoistingViolation(artifactSite.call, rootBlock);
      if (lexicalContext !== undefined) {
        pushDiagnostic(
          ARTIFACT_HOISTING_CODE,
          artifactSite.loc,
          HOISTING_EXPLANATIONS[lexicalContext],
        );
      }
    }
  }

  const validPresetNames = collectedArtifacts
    .filter((item) => isArtifactPresetOp(item.kind))
    .map((entry) => entry.id);
  const contentArtifactNames = new Set(
    collectedArtifacts.filter((item) => !isArtifactPresetOp(item.kind)).map((entry) => entry.id),
  );

  for (const reportSite of siteTable.reports) {
    if (!reportSite.artifactIdExpr) continue;
    const tagLoc = nodeLocation(reportSite.artifactIdExpr);

    if (reportSite.artifactId === undefined) {
      pushDiagnostic(
        ARTIFACT_DECLARATION_CODE,
        tagLoc,
        "report()'s artifact tag must be a compile-time string literal naming a preset artifact " +
          "declared in this script: the tag is how an item finds its dashboard, and a tag that only " +
          "exists at run time cannot be checked against the declarations. Write the id inline.",
      );
      continue;
    }

    const targetTag = reportSite.artifactId;
    if (validPresetNames.includes(targetTag)) continue;

    if (contentArtifactNames.has(targetTag)) {
      pushDiagnostic(
        ARTIFACT_DECLARATION_CODE,
        tagLoc,
        `report()'s tag "${targetTag}" names a file/markdown artifact, which holds content rather than a ` +
          "stream of items — there is nothing for this item to become. Tag the item with a preset " +
          "artifact (chart / table / metrics / board), or drop the tag and let the item go to the " +
          "run's Results.",
      );
      continue;
    }

    pushDiagnostic(
      ARTIFACT_DECLARATION_CODE,
      tagLoc,
      `report()'s tag "${targetTag}" names no preset artifact declared in this script${formatPresetEnumeration(validPresetNames)}. ` +
        'Declare it first — artifact.chart("' +
        targetTag +
        '", { x, y }) at the top of the script — or drop the tag.',
    );
  }

  return {
    declaredArtifacts: canonicalizeDeclaredArtifacts(collectedArtifacts),
    diagnostics: issues,
  };
}

function findPrimaryTrueLiteral(site: ArtifactSite): ts.Node | undefined {
  const argumentIndex = isArtifactPresetOp(site.op) ? 1 : 2;
  const configArg = site.call.arguments[argumentIndex];
  if (!configArg || !ts.isObjectLiteralExpression(configArg)) return void 0;

  for (const prop of configArg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const keyNode = prop.name;
    const identifier =
      ts.isIdentifier(keyNode) || ts.isStringLiteral(keyNode) ? keyNode.text : void 0;
    if (identifier === "primary" && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      return prop;
    }
  }
  return void 0;
}

function formatPresetEnumeration(presetNames: readonly string[]): string {
  if (presetNames.length === 0) return " (this script declares no preset artifacts at all)";
  const sortedNames = [...presetNames]
    .sort()
    .map((name) => `"${name}"`)
    .join(", ");
  return ` (declared presets: ${sortedNames})`;
}

function canonicalizeDeclaredArtifacts(artifacts: readonly DeclaredArtifact[]): DeclaredArtifact[] {
  const registry = new Set<string>();
  const deduplicated: DeclaredArtifact[] = [];

  for (const entry of artifacts) {
    const signatureKey = `${entry.id}\0${entry.kind}`;
    if (!registry.has(signatureKey)) {
      registry.add(signatureKey);
      deduplicated.push(entry);
    }
  }

  return deduplicated.sort((first, second) => {
    if (first.id !== second.id) {
      return first.id < second.id ? -1 : 1;
    }
    return first.kind.localeCompare(second.kind);
  });
}

function determineHoistingViolation(
  callExpr: ts.CallExpression,
  rootScope: ts.Block,
): HoistingContext | undefined {
  let innerChild: ts.Node = callExpr;
  let outerParent: ts.Node | undefined = callExpr.parent;

  while (outerParent !== undefined) {
    if (outerParent === rootScope) return void 0;

    if (
      ts.isArrowFunction(outerParent) ||
      ts.isFunctionExpression(outerParent) ||
      ts.isMethodDeclaration(outerParent)
    ) {
      return "callback";
    }

    if (
      ts.isForStatement(outerParent) ||
      ts.isForOfStatement(outerParent) ||
      ts.isForInStatement(outerParent) ||
      ts.isWhileStatement(outerParent) ||
      ts.isDoStatement(outerParent)
    ) {
      return "loop";
    }

    if (
      ts.isIfStatement(outerParent) &&
      (outerParent.thenStatement === innerChild || outerParent.elseStatement === innerChild)
    ) {
      return "conditional";
    }

    if (
      ts.isConditionalExpression(outerParent) &&
      (outerParent.whenTrue === innerChild || outerParent.whenFalse === innerChild)
    ) {
      return "conditional";
    }

    if (ts.isCaseClause(outerParent) || ts.isDefaultClause(outerParent)) {
      return "conditional";
    }

    innerChild = outerParent;
    outerParent = outerParent.parent;
  }

  return void 0;
}
