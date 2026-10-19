// SPDX-License-Identifier: Apache-2.0
import { ARTIFACT_CAPS } from "../facade/artifact-caps.js";
import type { ArtifactPresetOp } from "../facade/registry.js";
import { canonicalJson } from "./hash.js";

type ArtifactSpecProblem = string | undefined;

class SpecValidationContext {
  // 格式化错误回显中的值类型
  formatType(val: unknown): string {
    if (val === null) return "null";
    if (Array.isArray(val)) return `array (${val.length} items)`;
    if (typeof val === "string") return JSON.stringify(val.slice(0, 40));
    return typeof val === "object" ? "object" : String(val);
  }

  isNonBlank(candidate: unknown): candidate is string {
    return typeof candidate === "string" && candidate.trim() !== "";
  }

  // 验证通用属性：title, description, primary
  validateMeta(dict: Record<string, unknown>): ArtifactSpecProblem {
    const { title, description, primary } = dict;

    if (title !== undefined) {
      if (typeof title !== "string") {
        return `spec title must be a string, got ${this.formatType(title)}`;
      }
      if (title.length > ARTIFACT_CAPS.maxTitleLength) {
        return `spec title is ${title.length} characters, over the ${ARTIFACT_CAPS.maxTitleLength} limit`;
      }
    }

    if (description !== undefined) {
      if (typeof description !== "string") {
        return `spec description must be a string, got ${this.formatType(description)}`;
      }
      if (description.length > ARTIFACT_CAPS.maxDescriptionLength) {
        return `spec description is ${description.length} characters, over the ${ARTIFACT_CAPS.maxDescriptionLength} limit`;
      }
    }

    if (primary !== undefined && typeof primary !== "boolean") {
      return `spec primary must be a boolean, got ${this.formatType(primary)}`;
    }
  }

  // 验证单个字段描述节点
  validateFieldNode(target: unknown, locator: string): ArtifactSpecProblem {
    if (typeof target !== "object" || target === null || Array.isArray(target)) {
      return `spec ${locator} must be { field: "…" }, got ${this.formatType(target)}`;
    }
    const item = target as Record<string, unknown>;
    if (!this.isNonBlank(item.field)) {
      return `spec ${locator}.field must be a non-empty string (a dot path into the item, e.g. "timing.after")`;
    }
    for (const key of ["label", "unit"] as const) {
      const v = item[key];
      if (v !== undefined && typeof v !== "string") {
        return `spec ${locator}.${key} must be a string, got ${this.formatType(v)}`;
      }
    }
  }

  // 验证字段列表
  validateFieldList(collection: unknown, locator: string): ArtifactSpecProblem {
    if (!Array.isArray(collection) || collection.length === 0) {
      return `spec ${locator} must be a non-empty array of fields ({ field: "…" })`;
    }
    for (let i = 0; i < collection.length; i++) {
      const issue = this.validateFieldNode(collection[i], `${locator}[${i}]`);
      if (issue) return issue;
    }
  }

  // 针对 chart 的专属约束
  validateChart(record: Record<string, unknown>): ArtifactSpecProblem {
    const errX = this.validateFieldNode(record.x, "x");
    if (errX) return errX;

    const y = record.y;
    if (Array.isArray(y)) {
      if (y.length === 0) {
        return "chart spec y is an empty array; give it at least one series";
      }
      for (let idx = 0; idx < y.length; idx++) {
        const errY = this.validateFieldNode(y[idx], `y[${idx}]`);
        if (errY) return errY;
      }
    } else {
      const errY = this.validateFieldNode(y, "y");
      if (errY) return errY;
    }

    if (record.type !== undefined) {
      const chartType = String(record.type);
      if (chartType !== "line" && chartType !== "bar" && chartType !== "scatter") {
        return `chart spec type must be "line", "bar" or "scatter", got ${this.formatType(record.type)}`;
      }
    }

    if (record.scale !== undefined) {
      const scaleType = String(record.scale);
      if (scaleType !== "linear" && scaleType !== "log") {
        return `chart spec scale must be "linear" or "log", got ${this.formatType(record.scale)}`;
      }
    }

    if (record.baseline !== undefined) {
      return this.validateFieldNode(record.baseline, "baseline");
    }
  }

  // 针对 table 的专属约束
  validateTable(record: Record<string, unknown>): ArtifactSpecProblem {
    const colErr = this.validateFieldList(record.columns, "columns");
    if (colErr) return colErr;

    if (record.key !== undefined && !this.isNonBlank(record.key)) {
      return "table spec key must be a non-empty string (the field that identifies a row)";
    }
  }

  // 针对 board 的专属约束
  validateBoard(record: Record<string, unknown>): ArtifactSpecProblem {
    if (!this.isNonBlank(record.key)) {
      return "board spec key must be a non-empty string (the field that identifies a card)";
    }
    if (!this.isNonBlank(record.status)) {
      return "board spec status must be a non-empty string (the field that picks a card's column)";
    }

    const cols = record.columns;
    if (!Array.isArray(cols) || cols.length === 0) {
      return "board spec columns must be a non-empty array of strings (the column order)";
    }
    for (let i = 0; i < cols.length; i++) {
      if (!this.isNonBlank(cols[i])) {
        return `board spec columns[${i}] must be a non-empty string`;
      }
    }

    if (record.cardTitle !== undefined && !this.isNonBlank(record.cardTitle)) {
      return "board spec cardTitle must be a non-empty string (the field used as the card title)";
    }

    if (record.detail !== undefined) {
      return this.validateFieldList(record.detail, "detail");
    }
  }

  // 主校验分发方法
  check(op: ArtifactPresetOp, spec: unknown): ArtifactSpecProblem {
    if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
      return `${op} spec must be an object literal, got ${this.formatType(spec)}`;
    }

    const mapping = spec as Record<string, unknown>;
    const metaProblem = this.validateMeta(mapping);
    if (metaProblem) return metaProblem;

    let shapeProblem: ArtifactSpecProblem;
    if (op === "chart") {
      shapeProblem = this.validateChart(mapping);
    } else if (op === "table") {
      shapeProblem = this.validateTable(mapping);
    } else if (op === "metrics") {
      shapeProblem = this.validateFieldList(mapping.metrics, "metrics");
    } else if (op === "board") {
      shapeProblem = this.validateBoard(mapping);
    }

    if (shapeProblem) return shapeProblem;

    const encodedBytes = new TextEncoder().encode(canonicalJson(spec)).length;
    if (encodedBytes > ARTIFACT_CAPS.maxSpecSerializedBytes) {
      return `${op} spec is ${encodedBytes} bytes serialized, over the ${ARTIFACT_CAPS.maxSpecSerializedBytes}-byte limit`;
    }
  }
}

// 供外部直接调用的顶层校验函数
export function validateArtifactSpec(op: ArtifactPresetOp, spec: unknown): ArtifactSpecProblem {
  return new SpecValidationContext().check(op, spec);
}
