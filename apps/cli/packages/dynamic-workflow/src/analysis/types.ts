// SPDX-License-Identifier: Apache-2.0

import type { ScriptLoc } from "../compiler/compile.js";

// Classification of workflow graph site vertices.
export type SiteKind =
  | "ask"
  | "world-read"
  | "join"
  | "fan-out"
  | "source"
  | "sink";

export type SiteLoc = ScriptLoc;

export interface NamePattern {
  readonly head?: string;
  readonly tail?: string;
}

export interface SiteNode {
  readonly id: string;
  readonly kind: SiteKind;
  readonly loc?: SiteLoc;
  readonly label: string;
  readonly labelPattern?: NamePattern;
  readonly actors?: string[];
  readonly within?: string;
  readonly artifactType?: string;
}

export interface ActorSite {
  readonly id: string;
  readonly loc: SiteLoc;
  readonly name?: string;
  readonly namePattern?: NamePattern;
  readonly within?: string;
}

export interface SiteEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: "data" | "context";
  readonly exact: boolean;
  readonly port?: number;
  readonly type?: string;
}

export interface SiteGraph {
  readonly nodes: SiteNode[];
  readonly actors: ActorSite[];
  readonly edges: SiteEdge[];
}
