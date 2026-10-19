// SPDX-License-Identifier: Apache-2.0
import type ts from "typescript";
import type { JsonSchema } from "./types.js";

// Tracks active evaluation frames to identify recursive type definitions and generate hoisted $defs.
export class DefinitionScope {
  private readonly completedDefs = new Map<ts.Type, { identifier: string; schema: JsonSchema }>();
  private readonly activeFrames = new Map<ts.Type, { cyclic: boolean }>();
  private readonly symbolAliases = new Map<ts.Type, string>();
  private readonly registeredNames = new Set<string>();

  public testCycle(type: ts.Type): string | undefined {
    const established = this.completedDefs.get(type);
    if (established) {
      return `#/$defs/${established.identifier}`;
    }

    const currentFrame = this.activeFrames.get(type);
    if (currentFrame) {
      currentFrame.cyclic = true;
      const refName = this.determineTypeName(type);
      return `#/$defs/${refName}`;
    }

    return undefined;
  }

  public openFrame(type: ts.Type): void {
    this.activeFrames.set(type, { cyclic: false });
  }

  public closeFrame(type: ts.Type, evaluatedSchema: JsonSchema): JsonSchema {
    const frame = this.activeFrames.get(type);
    this.activeFrames.delete(type);

    if (!frame || !frame.cyclic) {
      return evaluatedSchema;
    }

    const defName = this.determineTypeName(type);
    this.completedDefs.set(type, { identifier: defName, schema: evaluatedSchema });
    return { $ref: `#/$defs/${defName}` };
  }

  public determineTypeName(type: ts.Type): string {
    const cached = this.symbolAliases.get(type);
    if (cached) {
      return cached;
    }

    const baseCandidate = type.aliasSymbol?.name || type.getSymbol()?.name || "Schema";
    let candidate = baseCandidate;
    let suffix = 1;

    while (this.registeredNames.has(candidate)) {
      suffix += 1;
      candidate = `${baseCandidate}${suffix}`;
    }

    this.registeredNames.add(candidate);
    this.symbolAliases.set(type, candidate);
    return candidate;
  }

  public extractDefinitions(): Record<string, JsonSchema> | undefined {
    if (this.completedDefs.size === 0) {
      return undefined;
    }

    const output: Record<string, JsonSchema> = {};
    for (const record of this.completedDefs.values()) {
      output[record.identifier] = record.schema;
    }
    return output;
  }
}
