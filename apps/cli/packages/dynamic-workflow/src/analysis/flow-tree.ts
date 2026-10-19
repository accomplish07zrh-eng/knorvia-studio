// SPDX-License-Identifier: Apache-2.0

import type { OrderEvent, OrderRegion, OrderTrace } from "./causality-order.js";

export interface LeafNode {
  event: OrderEvent;
  index: number;
  type: "leaf";
}

export interface RegionNode {
  children: TreeNode[];
  first: number;
  region: OrderRegion;
  type: "region";
}

export type TreeNode = RegionNode | LeafNode;

// Cache `first` on the way up. Sorting a parent before its children have a cached
// leaf index re-walks every subtree and is exponential on deep inlined traces.
export function buildTree(trace: OrderTrace): { root: RegionNode; byId: Map<string, RegionNode> } {
  const byId = new Map<string, RegionNode>();
  mountRegions(trace.regions, byId);
  attachChildren(trace.regions, byId);
  attachEvents(trace, byId);
  const root = byId.get(trace.root);
  if (root === undefined) throw new Error("trace root is not a region");
  assignFirstLeaf(root);
  return { byId, root };
}

function mountRegions(regions: readonly OrderRegion[], byId: Map<string, RegionNode>): void {
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    if (region === undefined) continue;
    const node: RegionNode = {
      children: [],
      first: Infinity,
      region,
      type: "region",
    };
    byId.set(region.id, node);
  }
}

function attachChildren(regions: readonly OrderRegion[], byId: Map<string, RegionNode>): void {
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const parentId = region?.parent;
    if (region === undefined || parentId === undefined) continue;
    const parent = byId.get(parentId);
    const child = byId.get(region.id);
    if (parent === undefined || child === undefined) continue;
    parent.children.push(child);
  }
}

function attachEvents(trace: OrderTrace, byId: Map<string, RegionNode>): void {
  const events = trace.events;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined) continue;
    const host = byId.get(innermostRegion(event, trace.root));
    if (host === undefined) continue;
    const leaf: LeafNode = { event, index, type: "leaf" };
    host.children.push(leaf);
  }
}

function innermostRegion(event: OrderEvent, root: string): string {
  const chain = event.regions;
  const home = chain[chain.length - 1];
  return home === undefined ? root : home;
}

function assignFirstLeaf(root: RegionNode): void {
  const pending: RegionNode[] = [root];
  const started = new Set<string>();
  const post: RegionNode[] = [];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    const id = node.region.id;
    if (started.has(id)) {
      post.push(node);
      continue;
    }
    started.add(id);
    pending.push(node);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child !== undefined && child.type === "region") pending.push(child);
    }
  }
  for (let index = 0; index < post.length; index += 1) {
    const node = post[index];
    if (node === undefined) continue;
    node.first = earliestMark(node);
    node.children.sort(byEarliestMark);
  }
}

function earliestMark(node: RegionNode): number {
  let earliest = Infinity;
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child === undefined) continue;
    const mark = markOf(child);
    if (mark < earliest) earliest = mark;
  }
  return earliest;
}

function markOf(node: TreeNode): number {
  return node.type === "leaf" ? node.index : node.first;
}

function byEarliestMark(left: TreeNode, right: TreeNode): number {
  const leftMark = markOf(left);
  const rightMark = markOf(right);
  if (leftMark === rightMark) return 0;
  return leftMark < rightMark ? -1 : 1;
}
