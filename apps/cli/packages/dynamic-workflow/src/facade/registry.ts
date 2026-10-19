// SPDX-License-Identifier: Apache-2.0

import ts from "typescript";
import { FACADE_FILE_NAME } from "./dts.js";
import { ARTIFACT_REGISTRY, WORLD_READ_REGISTRY } from "./registry-tables.js";

export { ARTIFACT_REGISTRY, WORLD_READ_REGISTRY };

export type WorldReadOp = import("./registry-tables.js").WorldReadOp;
export type ArtifactRow = import("./registry-tables.js").ArtifactRow;
export type ArtifactOp = import("./registry-tables.js").ArtifactOp;
export type ArtifactContentOp = import("./registry-tables.js").ArtifactContentOp;
export type ArtifactPresetOp = import("./registry-tables.js").ArtifactPresetOp;

type SiteProducingFunction = "agent" | "report";
type MarkerFunction = "phase";
type ArtifactFamily = "content" | "preset";
type ArtifactRegistryRow = (typeof ARTIFACT_REGISTRY)[number];

interface FacadeAddress {
  readonly container: string | undefined;
  readonly member: string;
}

/**
 * facade 身份由「声明容器 + 成员名」两段构成：顶层 `log()` 与 `git.log` 同名，
 * 只有容器能把它们分开。
 */
type FacadeSite =
  | { readonly kind: "site-function"; readonly name: SiteProducingFunction }
  | { readonly kind: "marker"; readonly name: MarkerFunction }
  | { readonly kind: "ask" }
  | { readonly kind: "artifact"; readonly row: ArtifactRegistryRow }
  | { readonly kind: "world-read"; readonly op: WorldReadOp };

const ASK_CONTAINER = "Agent";
const ASK_MEMBER = "ask";
const ARTIFACT_CONTAINER = "artifact";

const artifactFamilyByOp = new Map(ARTIFACT_REGISTRY.map((row) => [row.op, row.family] as const));

const presetOps: ReadonlySet<string> = new Set(
  ARTIFACT_REGISTRY.filter((row) => row.family === "preset").map((row) => row.op),
);

const siteMembers = new Set<string>([ASK_MEMBER]);
for (const row of ARTIFACT_REGISTRY) siteMembers.add(row.member);
for (const row of WORLD_READ_REGISTRY) siteMembers.add(row.member);

export const SITE_MEMBER_NAMES: ReadonlySet<string> = siteMembers;

function facadeDeclaration(symbol: ts.Symbol | undefined): ts.Declaration | undefined {
  for (const declaration of symbol?.declarations ?? []) {
    if (declaration.getSourceFile().fileName === FACADE_FILE_NAME) return declaration;
  }
  return undefined;
}

function identifierName(name: ts.BindingName): string | undefined {
  return ts.isIdentifier(name) ? name.text : undefined;
}

function nearestContainer(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node;
  while (current !== undefined && !ts.isSourceFile(current)) {
    if (ts.isVariableDeclaration(current)) {
      const name = identifierName(current.name);
      if (name !== undefined) return name;
    } else if (ts.isInterfaceDeclaration(current) || ts.isTypeAliasDeclaration(current)) {
      return current.name.text;
    }
    current = current.parent;
  }
  return undefined;
}

export function facadeContainerOf(declaration: ts.Node | undefined): string | undefined {
  if (!declaration || declaration.getSourceFile().fileName !== FACADE_FILE_NAME) return undefined;
  return nearestContainer(declaration.parent);
}

function facadeAddressOf(symbol: ts.Symbol | undefined): FacadeAddress | undefined {
  if (symbol === undefined) return undefined;
  const declaration = facadeDeclaration(symbol);
  return declaration === undefined
    ? undefined
    : { container: facadeContainerOf(declaration), member: symbol.name };
}

function siteAt(container: string | undefined, member: string): FacadeSite | undefined {
  if (container === undefined) {
    if (member === "agent" || member === "report") {
      return { kind: "site-function", name: member };
    }
    return member === "phase" ? { kind: "marker", name: member } : undefined;
  }
  if (container === ASK_CONTAINER) {
    return member === ASK_MEMBER ? { kind: "ask" } : undefined;
  }
  if (container === ARTIFACT_CONTAINER) {
    const row = ARTIFACT_REGISTRY.find((candidate) => candidate.member === member);
    return row === undefined ? undefined : { kind: "artifact", row };
  }
  const row = WORLD_READ_REGISTRY.find(
    (candidate) => candidate.container === container && candidate.member === member,
  );
  return row === undefined ? undefined : { kind: "world-read", op: row.op };
}

function siteOfSymbol(symbol: ts.Symbol | undefined): FacadeSite | undefined {
  const address = facadeAddressOf(symbol);
  return address === undefined ? undefined : siteAt(address.container, address.member);
}

export function artifactRowOfSymbol(
  symbol: ts.Symbol | undefined,
): ArtifactRegistryRow | undefined {
  const site = siteOfSymbol(symbol);
  return site?.kind === "artifact" ? site.row : undefined;
}

export function artifactFamilyOf(op: ArtifactOp): ArtifactFamily {
  const family = artifactFamilyByOp.get(op);
  if (family === undefined) throw new Error(`unknown artifact op: ${op}`);
  return family;
}

export function isArtifactPresetOp(op: string): op is ArtifactPresetOp {
  return presetOps.has(op);
}

export function siteProducingFunctionOfSymbol(
  symbol: ts.Symbol | undefined,
): SiteProducingFunction | undefined {
  const site = siteOfSymbol(symbol);
  return site?.kind === "site-function" ? site.name : undefined;
}

export function markerFunctionOfSymbol(symbol: ts.Symbol | undefined): MarkerFunction | undefined {
  const site = siteOfSymbol(symbol);
  return site?.kind === "marker" ? site.name : undefined;
}

export function isSiteProducing(container: string | undefined, member: string): boolean {
  const site = siteAt(container, member);
  return site !== undefined && site.kind !== "marker";
}

export function worldReadOpOfSymbol(symbol: ts.Symbol | undefined): WorldReadOp | undefined {
  const site = siteOfSymbol(symbol);
  return site?.kind === "world-read" ? site.op : undefined;
}
