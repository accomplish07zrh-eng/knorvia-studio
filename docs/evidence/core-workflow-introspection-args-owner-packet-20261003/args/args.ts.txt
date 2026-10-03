import type {
  SavedWorkflowArgDeclaration,
  SavedWorkflowArgsDeclaration,
} from "@knorvia/contracts";

export type WorkflowArgsValidation =
  | {
      ok: true;
      args: Record<string, unknown>;
    }
  | {
      ok: false;
      errors: string[];
    };

export function validateWorkflowArgs(
  declaration: SavedWorkflowArgsDeclaration | undefined,
  provided: Record<string, unknown> | undefined,
): WorkflowArgsValidation {
  const declared = declaration ?? {};
  const supplied = provided ?? {};
  const errors: string[] = [];
  const args: Record<string, unknown> = {};
  const declaredNames = Object.keys(declared);

  for (const name of Object.keys(supplied)) {
    if (declared[name] === undefined) {
      errors.push(
        declaredNames.length === 0
          ? `unknown argument '${name}': this workflow declares no arguments`
          : `unknown argument '${name}' (declared: ${declaredNames.join(", ")})`,
      );
    }
  }

  for (const [name, spec] of Object.entries(declared)) {
    const value = supplied[name];
    if (value === undefined) {
      if (spec.default !== undefined) {
        const error = validateValue(name, spec, spec.default, "default value");
        if (error === undefined) {
          args[name] = spec.default;
        } else {
          errors.push(error);
        }
      } else if (spec.required === true) {
        errors.push(`missing required argument '${name}'`);
      }
      continue;
    }

    const error = validateValue(name, spec, value, "value");
    if (error === undefined) {
      args[name] = value;
    } else {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, args };
}

function validateValue(
  name: string,
  spec: SavedWorkflowArgDeclaration,
  value: unknown,
  label: "value" | "default value",
): string | undefined {
  let expected: string;
  switch (spec.type) {
    case "string":
      if (typeof value === "string") return undefined;
      expected = "a string";
      break;
    case "number":
      if (typeof value === "number" && Number.isFinite(value)) return undefined;
      expected = "a finite number";
      break;
    case "boolean":
      if (typeof value === "boolean") return undefined;
      expected = "a boolean";
      break;
    case "json":
      return undefined;
    default:
      return undefined;
  }
  return `argument '${name}': expected ${expected}, got ${describeValue(value)} (${label})`;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}
