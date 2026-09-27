// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { JsonSchema } from "@knorvia/contracts";
import {
  createCustomIssue,
  createInvalidTypeIssue,
  createInvalidUnionIssue,
  createUnrecognizedKeysIssue,
} from "../tool-input-validation-issues.js";
import { bounds, valueAndType } from "./constraints.js";
import { collect, issuePath, record, type Diagnostics, type Frame } from "./frame.js";

type Work = Frame | (() => void);
const CYCLE_MESSAGE = "Cyclic schema/value pair cannot be validated";

class ValidationRun {
  private readonly work: Work[] = [];
  private readonly ancestors = new Map<JsonSchema, Set<unknown>>();
  private structuralFailure: Diagnostics | undefined;

  evaluate(value: unknown, schema: JsonSchema): Diagnostics {
    const diagnostics = collect();
    this.work.push({ value, schema, trail: undefined, display: "$", diagnostics });
    while (this.work.length && !this.structuralFailure) {
      const task = this.work.pop()!;
      if (typeof task === "function") task();
      else this.visit(task);
    }
    return this.structuralFailure ?? diagnostics;
  }

  private visit(frame: Frame): void {
    const { value, schema, diagnostics, trail } = frame;
    const active = this.ancestors.get(schema) ?? new Set<unknown>();
    if (active.has(value)) {
      // 只写入分支收集器会被 oneOf 的成功兄弟吞掉；结构性循环必须使整次校验失败。
      this.structuralFailure = {
        errors: [`${frame.display}: ${CYCLE_MESSAGE}`],
        issues: [createCustomIssue(CYCLE_MESSAGE, issuePath(trail))],
      };
      return;
    }
    active.add(value);
    this.ancestors.set(schema, active);
    // 活动对只属于当前祖先链；退出后删除，不能把兄弟节点的共享 schema 当作循环。
    this.work.push(() => {
      active.delete(value);
      if (active.size === 0) this.ancestors.delete(schema);
    });

    if (Array.isArray(schema.oneOf)) {
      const choices = schema.oneOf.filter(record);
      if (choices.length === schema.oneOf.length) {
        this.alternatives(frame, choices);
        return;
      }
    }
    if (!valueAndType(frame)) return;
    if (typeof value === "string" || typeof value === "number") {
      const origin = typeof value === "string" ? "string" : "number";
      const amount = typeof value === "string" ? value.length : value;
      for (const issue of bounds(frame, origin, amount)) diagnostics.issues.push(issue);
    } else if (Array.isArray(value)) {
      const sizeIssues = bounds(frame, "array", value.length);
      // UI errors 在元素之前记录长度；provider issues 在元素之后，不能统一排序。
      this.work.push(() => {
        for (const issue of sizeIssues) diagnostics.issues.push(issue);
      });
      if (record(schema.items)) {
        const children: Frame[] = [];
        const itemSchema = schema.items;
        value.forEach((item, index) =>
          children.push({
            value: item,
            schema: itemSchema,
            diagnostics,
            trail: { parent: trail, segment: index },
            display: `${frame.display}[${index}]`,
          }),
        );
        this.schedule(children);
      }
    } else if (record(value)) this.members(frame, value);
  }

  private alternatives(frame: Frame, choices: JsonSchema[]): void {
    const branches = choices.map(() => collect());
    this.work.push(() => {
      const matched = branches.filter((branch) => branch.errors.length === 0).length;
      if (matched === 1) return;
      frame.diagnostics.errors.push(
        `${frame.display} must match exactly one oneOf schema, matched ${matched}`,
      );
      frame.diagnostics.issues.push(
        createInvalidUnionIssue(
          branches.map((branch) => branch.issues),
          issuePath(frame.trail),
        ),
      );
    });
    this.schedule(
      choices.map((schema, index) => ({
        value: frame.value,
        schema,
        trail: undefined,
        display: "$",
        diagnostics: branches[index],
      })),
    );
  }

  private members(frame: Frame, value: JsonSchema): void {
    const { schema, display, diagnostics, trail } = frame;
    const required = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [];
    const requiredNames = new Set(required);
    const properties = record(schema.properties) ? schema.properties : {};
    const absent = (key: string) => !(key in value) || value[key] === undefined;
    for (const key of required)
      if (absent(key)) diagnostics.errors.push(`${display}.${key} is required`);
    this.work.push(() => {
      for (const key of required) {
        if (!Object.hasOwn(properties, key) && absent(key))
          diagnostics.issues.push(
            createInvalidTypeIssue(
              undefined,
              "unknown",
              issuePath({ parent: trail, segment: key }),
            ),
          );
      }
      if (schema.additionalProperties === false) {
        const allowed = new Set(Object.keys(properties));
        const extra = Object.keys(value).filter((key) => !allowed.has(key));
        for (const key of extra) diagnostics.errors.push(`${display}.${key} is not allowed`);
        if (extra.length)
          diagnostics.issues.push(createUnrecognizedKeysIssue(extra, issuePath(trail)));
      }
    });
    const children: Work[] = [];
    for (const [key, property] of Object.entries(properties)) {
      const child: Frame = {
        value: value[key],
        schema: record(property) ? property : {},
        diagnostics,
        trail: { parent: trail, segment: key },
        display: `${display}.${key}`,
      };
      if (absent(key)) {
        if (requiredNames.has(key)) children.push(() => this.missing(child));
      } else if (record(property)) children.push(child);
    }
    this.schedule(children);
  }

  private missing(frame: Frame): void {
    const branch = collect();
    this.work.push(() => {
      if (branch.issues.length) {
        for (const issue of branch.issues) frame.diagnostics.issues.push(issue);
        return;
      }
      const schema = frame.schema;
      const inferred =
        typeof schema.type === "string"
          ? schema.type
          : record(schema.properties) || Array.isArray(schema.required)
            ? "object"
            : record(schema.items)
              ? "array"
              : "unknown";
      frame.diagnostics.issues.push(
        createInvalidTypeIssue(undefined, inferred, issuePath(frame.trail)),
      );
    });
    this.work.push({ ...frame, value: undefined, diagnostics: branch, display: "$" });
  }

  private schedule(tasks: Work[]): void {
    for (let index = tasks.length - 1; index >= 0; index--) this.work.push(tasks[index]);
  }
}

export function evaluateSchema(value: unknown, schema: JsonSchema): Diagnostics {
  return new ValidationRun().evaluate(value, schema);
}
