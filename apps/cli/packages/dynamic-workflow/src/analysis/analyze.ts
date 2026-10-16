// SPDX-License-Identifier: Apache-2.0

import { collectDiagnostics, createWorkflowProgram } from "../compiler/compile.js";
import type { CompileDiagnostic } from "../compiler/compile.js";
import { collectDuplicateActorNames, FANOUT_ACTOR_NAME_CODE } from "./actor-names.js";
import { collectArtifactDeclarations, type DeclaredArtifact } from "./artifacts.js";
import type { CausalityGraph } from "./causality-graph.js";
import { projectCausalityGraph } from "./causality-graph.js";
import type { AnalysisCore } from "./core.js";
import { collectFacadeMisuse } from "./facade-misuse.js";
import type { ControlFlowGraph } from "./flow-graph.js";
import { projectControlFlow } from "./flow-graph.js";
import { projectSiteGraph } from "./graph.js";
import type { HandoffGraph } from "./handoff-graph.js";
import { projectHandoffGraph } from "./handoff-graph.js";
import { interpret } from "./interpret.js";
import { collectPhaseMarkerDiagnostics } from "./phases.js";
import { collectSites } from "./sites.js";
import type { SiteGraph } from "./types.js";
import { collectWorldRunCommands } from "./world-run.js";

// `ok` means the script can be submitted. Graphs are kept for a clean script and for
// fan-out actor-name warnings, which fail at runtime rather than blocking projection.
export interface AnalyzeResult {
  readonly diagnostics: CompileDiagnostic[];
  readonly ok: boolean;
  readonly core?: AnalysisCore;
  readonly graph?: SiteGraph;
  readonly causality?: CausalityGraph;
  readonly flow?: ControlFlowGraph;
  readonly handoff?: HandoffGraph;
  readonly declaredArtifacts: DeclaredArtifact[];
}

function withoutGraphs(issues: CompileDiagnostic[]): AnalyzeResult {
  return { declaredArtifacts: [], diagnostics: issues, ok: false };
}

function withheld(issues: CompileDiagnostic[], declaredArtifacts: DeclaredArtifact[]): AnalyzeResult {
  return { declaredArtifacts, diagnostics: issues, ok: false };
}

function blocksProjection(issues: readonly CompileDiagnostic[]): boolean {
  return issues.some((issue) => issue.code !== FANOUT_ACTOR_NAME_CODE);
}

export function analyzeWorkflowScript(source: string): AnalyzeResult {
  const program = createWorkflowProgram(source);
  const syntaxIssues = collectDiagnostics(program.program);
  if (syntaxIssues.length > 0) return withoutGraphs(syntaxIssues);

  const sites = collectSites(program);
  const facadeIssues = collectFacadeMisuse(program, sites);
  if (facadeIssues.length > 0) return withoutGraphs(facadeIssues);

  const world = collectWorldRunCommands(program, sites);
  const declared = collectArtifactDeclarations(program, sites);
  const authoringIssues = world.diagnostics.concat(
    declared.diagnostics,
    collectPhaseMarkerDiagnostics(program, sites),
    collectDuplicateActorNames(program, sites),
  );
  if (blocksProjection(authoringIssues)) return withheld(authoringIssues, declared.declaredArtifacts);

  const analysis = interpret(program, sites);
  const sitesGraph = projectSiteGraph(analysis);
  const causalityGraph = projectCausalityGraph(analysis, sitesGraph);
  return {
    causality: causalityGraph,
    core: analysis,
    declaredArtifacts: declared.declaredArtifacts,
    diagnostics: authoringIssues,
    flow: projectControlFlow(analysis),
    graph: sitesGraph,
    handoff: projectHandoffGraph(analysis, causalityGraph, sitesGraph),
    ok: authoringIssues.length === 0,
  };
}
