// SPDX-License-Identifier: Apache-2.0

import type { ScriptLoc } from "../compiler/compile.js";

// Facade calls versus the two virtual endpoints of the may-flow graph.
const INTERACTION_KINDS = ["ask", "world-read", "join", "fan-out"] as const;
const ENDPOINT_KINDS = ["source", "sink"] as const;

type InteractionKind = (typeof INTERACTION_KINDS)[number];
type EndpointKind = (typeof ENDPOINT_KINDS)[number];

export type SiteKind = InteractionKind | EndpointKind;

export type SiteLoc = ScriptLoc;

// Literal text before the first hole and after the last hole of a template
// that is never unfolded into concrete names.
interface TemplateAffix {
  readonly head?: string;
  readonly tail?: string;
}

export interface NamePattern extends TemplateAffix {}

// What every positioned site has. Endpoints omit location, lane, and artifact.
interface SiteIdentity {
  readonly id: string;
  readonly kind: SiteKind;
  readonly label: string;
}

export interface SiteNode extends SiteIdentity {
  readonly loc?: SiteLoc;
  readonly labelPattern?: NamePattern;
  readonly actors?: string[];
  readonly within?: string;
  readonly artifactType?: string;
}

interface LaneIdentity {
  readonly id: string;
  readonly loc: SiteLoc;
}

export interface ActorSite extends LaneIdentity {
  readonly name?: string;
  readonly namePattern?: NamePattern;
  readonly within?: string;
}

interface FlowEndpoints {
  readonly from: string;
  readonly to: string;
}

export interface SiteEdge extends FlowEndpoints {
  readonly kind: "data" | "context";
  readonly exact: boolean;
  readonly port?: number;
  readonly type?: string;
}

interface GraphTables {
  readonly nodes: SiteNode[];
  readonly actors: ActorSite[];
  readonly edges: SiteEdge[];
}

export interface SiteGraph extends GraphTables {}
