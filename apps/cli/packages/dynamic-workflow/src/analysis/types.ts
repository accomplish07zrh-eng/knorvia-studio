// SPDX-License-Identifier: Apache-2.0

import type { ScriptLoc } from "../compiler/compile.js";

export type SiteKind = "ask" | "world-read" | "join" | "fan-out" | "source" | "sink";

export type SiteLoc = ScriptLoc;

export interface NamePattern {
  head?: string;
  tail?: string;
}

export interface SiteNode {
  id: string;
  kind: SiteKind;
  loc?: SiteLoc;
  label: string;
  labelPattern?: NamePattern;
  actors?: string[];
  within?: string;
  artifactType?: string;
}

export interface ActorSite {
  id: string;
  loc: SiteLoc;
  name?: string;
  namePattern?: NamePattern;
  within?: string;
}

export interface SiteEdge {
  from: string;
  to: string;
  kind: "data" | "context";
  exact: boolean;
  port?: number;
  type?: string;
}

export interface SiteGraph {
  nodes: SiteNode[];
  actors: ActorSite[];
  edges: SiteEdge[];
}
