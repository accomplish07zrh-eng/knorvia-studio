// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { CoreErrorType, createCoreError, type ToolCallId } from "@knorvia/contracts";
import type { ToolScheduleItem } from "../scheduler.js";

interface Vertex {
  item: ToolScheduleItem;
  waiting: number;
  completed: boolean;
}

const UNRESOLVED_MESSAGE = "Circular dependency detected in tool scheduling";
const ARRAY_ELEMENT = /^(?:0|[1-9]\d*)$/u;

function hasElementAccessor(dependencies: ToolCallId[]): boolean {
  return Object.entries(Object.getOwnPropertyDescriptors(dependencies)).some(
    ([key, descriptor]) => ARRAY_ELEMENT.test(key) && ("get" in descriptor || "set" in descriptor),
  );
}

/** One planning call owns this graph. The index releases only affected successors. */
export class DependencyPlan {
  private readonly vertices: Map<ToolCallId, Vertex>;
  private readonly followers = new Map<ToolCallId, ToolCallId[]>();
  private readonly ready: ToolCallId[];
  private readonly dynamicDependencies: boolean;

  constructor(items: ToolScheduleItem[]) {
    this.vertices = new Map(
      items.map((item) => [
        item.toolCallId,
        {
          item,
          waiting: item.dependencies.length,
          completed: false,
        },
      ]),
    );
    this.ready = items
      .filter((item) => item.dependencies.length === 0)
      .map((item) => item.toolCallId);
    // own 元素 getter 不能提前求值；无就绪节点时旧合同甚至不会读取元素。
    // 检测只看描述符，动态查询仍共用本图的计数、FIFO 和终态验证。
    this.dynamicDependencies = [...this.vertices.values()].some((vertex) =>
      hasElementAccessor(vertex.item.dependencies),
    );
    if (this.dynamicDependencies) return;
    for (const [target, vertex] of this.vertices) {
      // 重复依赖计入等待量，但完成一个 ID 只释放一次；不能通过去重计数吞掉旧错误。
      for (const prerequisite of new Set(vertex.item.dependencies)) {
        const targets = this.followers.get(prerequisite) ?? [];
        targets.push(target);
        this.followers.set(prerequisite, targets);
      }
    }
  }

  ordered(): ToolScheduleItem[] {
    const output: ToolScheduleItem[] = [];
    for (let head = 0; head < this.ready.length; head++) {
      const current = this.ready[head];
      const vertex = this.vertices.get(current);
      if (!vertex || vertex.completed) continue;
      vertex.completed = true;
      output.push(vertex.item);
      for (const target of this.releases(current)) {
        target.waiting--;
        if (target.waiting === 0) this.ready.push(target.item.toolCallId);
      }
    }
    const remaining = [...this.vertices]
      .filter(([, vertex]) => !vertex.completed)
      .map(([id]) => id);
    if (remaining.length) {
      throw createCoreError(CoreErrorType.InvalidStateTransition, UNRESOLVED_MESSAGE, {
        context: { remaining },
        recoverable: false,
      });
    }
    return output;
  }

  private *releases(current: ToolCallId): Generator<Vertex> {
    if (this.dynamicDependencies) {
      for (const vertex of this.vertices.values()) {
        if (!vertex.completed && vertex.item.dependencies.includes(current)) yield vertex;
      }
    } else {
      for (const successor of this.followers.get(current) ?? []) {
        const vertex = this.vertices.get(successor)!;
        if (!vertex.completed) yield vertex;
      }
    }
  }

  verify(groups: ToolCallId[][]): void {
    for (const group of groups) {
      const membership = new Set(group);
      for (const toolId of group) {
        const vertex = this.vertices.get(toolId);
        if (!vertex) continue;
        for (const dependency of vertex.item.dependencies) {
          if (!membership.has(dependency)) continue;
          throw createCoreError(
            CoreErrorType.InvalidStateTransition,
            `Circular dependency detected: ${toolId} depends on ${dependency} in same group`,
            {
              context: { toolId, dependency, group },
              recoverable: false,
            },
          );
        }
      }
    }
  }
}
