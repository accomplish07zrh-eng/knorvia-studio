// SPDX-License-Identifier: Apache-2.0
import type { SiteGraph, SiteNode } from "../analysis/types.js";
import { interpret } from "../analysis/interpret.js";
import { projectSiteGraph } from "../analysis/graph.js";
import type { SiteTable } from "../analysis/sites.js";
import type { WorkflowProgram } from "../compiler/compile.js";
import type { AskSpec } from "../engine/types.js";
import { canonicalJson } from "../engine/hash.js";
import type { JsonSchema } from "./types.js";

// Knorvia dynamic-workflow actor submit tool profile definitions.
export type ActorSubmitProfile =
  | { readonly kind: "untyped" }
  | { readonly kind: "mono"; readonly schema: JsonSchema }
  | { readonly kind: "generic" };

// Reusable generic profile token when a consistent single schema is absent.
export const GENERIC_SUBMIT_PROFILE: ActorSubmitProfile = Object.freeze({
  kind: "generic",
});

interface InferredActorState {
  classification: "untyped" | "mono" | "generic";
  monoSchemaPayload?: JsonSchema;
  monoSchemaHash?: string;
}

class ActorProfileAnalyzer {
  private readonly ordering: string[] = [];
  private readonly stateMap = new Map<string, InferredActorState>();

  constructor(graph: SiteGraph) {
    for (const actorSite of graph.actors) {
      this.registerActor(actorSite.id);
    }
  }

  private registerActor(actorId: string): InferredActorState {
    let existing = this.stateMap.get(actorId);
    if (!existing) {
      existing = { classification: "untyped" };
      this.stateMap.set(actorId, existing);
      this.ordering.push(actorId);
    }
    return existing;
  }

  public analyze(
    siteNodes: readonly SiteNode[],
    askSpecs: ReadonlyMap<string, AskSpec>,
  ): Map<string, ActorSubmitProfile> {
    for (const siteItem of siteNodes) {
      if (siteItem.kind !== "ask") {
        continue;
      }

      const candidateActors = siteItem.actors ?? [];
      const spec = askSpecs.get(siteItem.id);

      // Conservatively fall back to generic for all actors if receiver cannot be resolved
      // or if askSpec is missing entirely.
      if (candidateActors.length === 0 || spec === undefined) {
        return this.produceFallbackMap();
      }

      if (!spec.typed) {
        continue;
      }

      const activeSchema = spec.schema as JsonSchema;
      const signature = canonicalJson(activeSchema);

      for (const targetActorId of candidateActors) {
        const actorState = this.registerActor(targetActorId);
        this.updateStateWithSchema(actorState, activeSchema, signature);
      }
    }

    return this.buildOutputProfiles();
  }

  private updateStateWithSchema(
    state: InferredActorState,
    schema: JsonSchema,
    signature: string,
  ): void {
    if (state.classification === "untyped") {
      state.classification = "mono";
      state.monoSchemaPayload = schema;
      state.monoSchemaHash = signature;
      return;
    }

    if (state.classification === "mono") {
      if (state.monoSchemaHash !== signature) {
        state.classification = "generic";
        state.monoSchemaPayload = undefined;
        state.monoSchemaHash = undefined;
      } else {
        state.monoSchemaPayload = schema;
      }
    }
  }

  private produceFallbackMap(): Map<string, ActorSubmitProfile> {
    const degradedMap = new Map<string, ActorSubmitProfile>();
    for (const actorId of this.ordering) {
      degradedMap.set(actorId, GENERIC_SUBMIT_PROFILE);
    }
    return degradedMap;
  }

  private buildOutputProfiles(): Map<string, ActorSubmitProfile> {
    const outcome = new Map<string, ActorSubmitProfile>();
    for (const actorKey of this.ordering) {
      const state = this.stateMap.get(actorKey);
      if (!state || state.classification === "untyped") {
        outcome.set(actorKey, { kind: "untyped" });
      } else if (state.classification === "mono" && state.monoSchemaPayload) {
        outcome.set(actorKey, { kind: "mono", schema: state.monoSchemaPayload });
      } else {
        outcome.set(actorKey, GENERIC_SUBMIT_PROFILE);
      }
    }
    return outcome;
  }
}

// Derives actor submit tool profiles from the site graph and ask specifications.
export function deriveActorSubmitProfiles(
  graph: SiteGraph,
  askSpecs: ReadonlyMap<string, AskSpec>,
): Map<string, ActorSubmitProfile> {
  const analyzer = new ActorProfileAnalyzer(graph);
  return analyzer.analyze(graph.nodes, askSpecs);
}

// Convenience helper to interpret program AST and project site graph before derivation.
export function deriveActorSubmitProfilesFor(
  workflow: WorkflowProgram,
  table: SiteTable,
  askSpecs: ReadonlyMap<string, AskSpec>,
): Map<string, ActorSubmitProfile> {
  const interpreted = interpret(workflow, table);
  const projected = projectSiteGraph(interpreted);
  return deriveActorSubmitProfiles(projected, askSpecs);
}
