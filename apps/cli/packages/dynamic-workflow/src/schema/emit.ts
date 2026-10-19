// SPDX-License-Identifier: Apache-2.0
import ts from "typescript";
import { harvestConstraints, mergeConstraints } from "./jsdoc.js";
import type { JsonSchema, JsonValue } from "./types.js";
import { MAX_UNION_MEMBERS } from "./types.js";
import { DefinitionScope } from "./definition-scope.js";

// Error raised when encountering types that cannot be mapped into valid JSON Schema.
export class SchemaRejection extends Error {
  public readonly reason: string;
  public readonly path: string;

  constructor(reason: string, path: string) {
    super(reason);
    this.name = "SchemaRejection";
    this.reason = reason;
    this.path = path;
  }
}

// Built-in JavaScript objects and runtime constructors banned from workflow payloads.
function isDisallowedBuiltinType(typeName: string): boolean {
  switch (typeName) {
    case "Date":
    case "RegExp":
    case "Promise":
    case "Map":
    case "WeakMap":
    case "ReadonlyMap":
    case "Set":
    case "WeakSet":
    case "ReadonlySet":
    case "Error":
    case "EvalError":
    case "RangeError":
    case "ReferenceError":
    case "SyntaxError":
    case "TypeError":
    case "URIError":
    case "ArrayBuffer":
    case "SharedArrayBuffer":
    case "DataView":
    case "Int8Array":
    case "Uint8Array":
    case "Uint8ClampedArray":
    case "Int16Array":
    case "Uint16Array":
    case "Int32Array":
    case "Uint32Array":
    case "Float32Array":
    case "Float64Array":
    case "BigInt64Array":
    case "BigUint64Array":
      return true;
    default:
      return false;
  }
}

function extractIntrinsicBoolean(nodeType: ts.Type): boolean {
  return (nodeType as unknown as { intrinsicName?: string }).intrinsicName === "true";
}

function resolveObjectTypeFlags(entity: ts.Type): number {
  return (entity.flags & ts.TypeFlags.Object) !== 0
    ? ((entity as ts.ObjectType).objectFlags ?? 0)
    : 0;
}

function extractEnumValues(typesList: readonly ts.Type[]): JsonValue[] | undefined {
  const collectedLiterals: JsonValue[] = [];
  for (const candidate of typesList) {
    const bitMask = candidate.flags;
    if ((bitMask & ts.TypeFlags.StringLiteral) !== 0) {
      collectedLiterals.push((candidate as ts.StringLiteralType).value);
    } else if ((bitMask & ts.TypeFlags.NumberLiteral) !== 0) {
      collectedLiterals.push((candidate as ts.NumberLiteralType).value);
    } else if ((bitMask & ts.TypeFlags.BooleanLiteral) !== 0) {
      collectedLiterals.push(extractIntrinsicBoolean(candidate));
    } else if ((bitMask & ts.TypeFlags.Null) !== 0) {
      collectedLiterals.push(null);
    } else {
      return undefined;
    }
  }
  return collectedLiterals;
}

// Orchestrates translation of TypeScript type definitions into compliant JSON Schema models.
export class SchemaEmitter {
  private readonly recursionScope = new DefinitionScope();

  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly location: ts.Node,
  ) {}

  public emitTop(targetType: ts.Type): JsonSchema {
    const rootSchema = this.dispatchInspection(targetType, "$");
    const extractedDefs = this.recursionScope.extractDefinitions();
    if (extractedDefs === undefined) {
      return rootSchema;
    }
    return {
      ...rootSchema,
      $defs: extractedDefs,
    };
  }

  public emitMembers(memberTypes: readonly ts.Type[], jsonPath: string): JsonSchema {
    const literalEnum = extractEnumValues(memberTypes);
    if (literalEnum !== undefined) {
      return { enum: literalEnum };
    }
    return {
      anyOf: memberTypes.map((child, order) =>
        this.dispatchInspection(child, `${jsonPath}|${order}`),
      ),
    };
  }

  private dispatchInspection(typeNode: ts.Type, locationPath: string): JsonSchema {
    const cycleRef = this.recursionScope.testCycle(typeNode);
    if (cycleRef) {
      return { $ref: cycleRef };
    }

    const flags = typeNode.flags;

    // 1. Guard against non-serializable primitive forms
    if ((flags & ts.TypeFlags.Any) !== 0) {
      throw new SchemaRejection(
        "type 'any' is not allowed; use 'unknown' or a concrete type",
        locationPath,
      );
    }
    if ((flags & ts.TypeFlags.Never) !== 0) {
      throw new SchemaRejection("type 'never' cannot be represented", locationPath);
    }
    if ((flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0) {
      throw new SchemaRejection("'undefined' is only allowed on optional properties", locationPath);
    }
    if ((flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) !== 0) {
      throw new SchemaRejection("'bigint' is not JSON-serializable", locationPath);
    }
    if ((flags & (ts.TypeFlags.ESSymbol | ts.TypeFlags.UniqueESSymbol)) !== 0) {
      throw new SchemaRejection("'symbol' is not JSON-serializable", locationPath);
    }

    // 2. Map primitive scalars and literal constants
    if ((flags & ts.TypeFlags.Unknown) !== 0) {
      return {};
    }
    if ((flags & ts.TypeFlags.Null) !== 0) {
      return { type: "null" };
    }
    if ((flags & ts.TypeFlags.StringLiteral) !== 0) {
      return { const: (typeNode as ts.StringLiteralType).value };
    }
    if ((flags & ts.TypeFlags.NumberLiteral) !== 0) {
      return { const: (typeNode as ts.NumberLiteralType).value };
    }
    if ((flags & ts.TypeFlags.BooleanLiteral) !== 0) {
      return { const: extractIntrinsicBoolean(typeNode) };
    }
    if ((flags & ts.TypeFlags.String) !== 0) {
      return { type: "string" };
    }
    if ((flags & ts.TypeFlags.Number) !== 0) {
      return { type: "number" };
    }
    if ((flags & ts.TypeFlags.Boolean) !== 0) {
      return { type: "boolean" };
    }

    // 3. Delegate structured and composite definitions
    if (typeNode.isUnion()) {
      return this.wrapCompositeEvaluation(typeNode, () =>
        this.processUnion(typeNode, locationPath),
      );
    }
    if (typeNode.isIntersection()) {
      return this.wrapCompositeEvaluation(typeNode, () =>
        this.processIntersection(typeNode, locationPath),
      );
    }
    if ((flags & ts.TypeFlags.Object) !== 0) {
      return this.wrapCompositeEvaluation(typeNode, () =>
        this.processObjectStructure(typeNode, locationPath),
      );
    }

    throw new SchemaRejection("type is not JSON-serializable", locationPath);
  }

  private wrapCompositeEvaluation(typeNode: ts.Type, evaluator: () => JsonSchema): JsonSchema {
    this.recursionScope.openFrame(typeNode);
    const generated = evaluator();
    return this.recursionScope.closeFrame(typeNode, generated);
  }

  private processUnion(unionNode: ts.UnionType, atLocation: string): JsonSchema {
    const branches = unionNode.types;
    if (branches.length > MAX_UNION_MEMBERS) {
      throw new SchemaRejection(
        `union has too many members (${branches.length} > ${MAX_UNION_MEMBERS})`,
        atLocation,
      );
    }

    for (const option of branches) {
      if ((option.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0) {
        throw new SchemaRejection("'undefined' is only allowed on optional properties", atLocation);
      }
    }

    return this.emitMembers(branches, atLocation);
  }

  private processIntersection(intersectNode: ts.IntersectionType, atLocation: string): JsonSchema {
    for (const segment of intersectNode.types) {
      const segFlags = segment.flags;
      if ((segFlags & ts.TypeFlags.String) !== 0) return { type: "string" };
      if ((segFlags & ts.TypeFlags.Number) !== 0) return { type: "number" };
      if ((segFlags & ts.TypeFlags.Boolean) !== 0) return { type: "boolean" };
    }

    if (intersectNode.getCallSignatures().length > 0) {
      throw new SchemaRejection("function types are not JSON-serializable", atLocation);
    }

    return this.synthesizeObjectProperties(intersectNode, atLocation);
  }

  private processObjectStructure(objectNode: ts.Type, atLocation: string): JsonSchema {
    if (this.verifyArrayReference(objectNode)) {
      return this.synthesizeArraySchema(objectNode as ts.TypeReference, atLocation);
    }
    if (this.verifyTupleReference(objectNode)) {
      return this.synthesizeTupleSchema(objectNode as ts.TupleTypeReference, atLocation);
    }

    if (
      objectNode.getCallSignatures().length > 0 ||
      objectNode.getConstructSignatures().length > 0
    ) {
      throw new SchemaRejection("function types are not JSON-serializable", atLocation);
    }

    const namedSymbol = objectNode.getSymbol();
    const symbolIdentifier = namedSymbol?.getName();
    if (symbolIdentifier && isDisallowedBuiltinType(symbolIdentifier)) {
      throw new SchemaRejection(`'${symbolIdentifier}' is not JSON-serializable`, atLocation);
    }

    if (((namedSymbol?.flags ?? 0) & ts.SymbolFlags.Class) !== 0) {
      throw new SchemaRejection("class instances are not JSON-serializable", atLocation);
    }

    if (this.inspectThenableContract(objectNode)) {
      throw new SchemaRejection("Promise/thenable values are not JSON-serializable", atLocation);
    }

    return this.synthesizeObjectProperties(objectNode, atLocation);
  }

  private synthesizeObjectProperties(typeContainer: ts.Type, atLocation: string): JsonSchema {
    const fieldDefinitions: Record<string, JsonSchema> = {};
    const mandatoryAttributes: string[] = [];
    const entityProperties = this.checker.getPropertiesOfType(typeContainer);

    for (const propSymbol of entityProperties) {
      const isFieldOptional = (propSymbol.flags & ts.SymbolFlags.Optional) !== 0;
      const declAnchor = propSymbol.valueDeclaration ?? this.location;
      const rawPropertyType = this.checker.getTypeOfSymbolAtLocation(propSymbol, declAnchor);
      const propertyPath = `${atLocation}.${propSymbol.name}`;

      const rawSchema = isFieldOptional
        ? this.stripUndefinedFromUnion(rawPropertyType, propertyPath)
        : this.dispatchInspection(rawPropertyType, propertyPath);

      const enrichedSchema = mergeConstraints(
        rawSchema,
        harvestConstraints(propSymbol, this.checker),
      );

      fieldDefinitions[propSymbol.name] = enrichedSchema;
      if (!isFieldOptional) {
        mandatoryAttributes.push(propSymbol.name);
      }
    }

    const objectResult: JsonSchema = { type: "object" };
    if (Object.keys(fieldDefinitions).length > 0) {
      objectResult.properties = fieldDefinitions;
    }
    if (mandatoryAttributes.length > 0) {
      objectResult.required = mandatoryAttributes;
    }

    const indexSignature = this.checker.getIndexInfoOfType(typeContainer, ts.IndexKind.String);
    objectResult.additionalProperties = indexSignature
      ? this.dispatchInspection(indexSignature.type, `${atLocation}[*]`)
      : false;

    return objectResult;
  }

  private stripUndefinedFromUnion(candidate: ts.Type, atLocation: string): JsonSchema {
    if (!candidate.isUnion()) {
      return this.dispatchInspection(candidate, atLocation);
    }

    const definedBranches = candidate.types.filter(
      (element) => (element.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) === 0,
    );

    if (definedBranches.length === candidate.types.length) {
      return this.dispatchInspection(candidate, atLocation);
    }
    if (definedBranches.length === 1 && definedBranches[0]) {
      return this.dispatchInspection(definedBranches[0], atLocation);
    }

    return this.emitMembers(definedBranches, atLocation);
  }

  private synthesizeArraySchema(arrayTypeRef: ts.TypeReference, atLocation: string): JsonSchema {
    const typeArguments = this.checker.getTypeArguments(arrayTypeRef);
    const element = typeArguments[0];
    const itemsSchema = element ? this.dispatchInspection(element, `${atLocation}[]`) : {};
    return { type: "array", items: itemsSchema };
  }

  private synthesizeTupleSchema(
    tupleTypeRef: ts.TupleTypeReference,
    atLocation: string,
  ): JsonSchema {
    const elementFlags = tupleTypeRef.target.elementFlags;
    const typeParams = this.checker.getTypeArguments(tupleTypeRef);
    const itemPrefixes: JsonSchema[] = [];
    let requiredCount = 0;
    let restSpreadSchema: JsonSchema | undefined;

    for (let index = 0; index < typeParams.length; index += 1) {
      const flag = elementFlags[index] ?? ts.ElementFlags.Required;
      const paramType = typeParams[index]!;
      const currentLoc = `${atLocation}[${index}]`;

      if ((flag & ts.ElementFlags.Rest) !== 0) {
        restSpreadSchema = this.dispatchInspection(paramType, currentLoc);
        continue;
      }

      const isOptional = (flag & ts.ElementFlags.Optional) !== 0;
      itemPrefixes.push(
        isOptional
          ? this.stripUndefinedFromUnion(paramType, currentLoc)
          : this.dispatchInspection(paramType, currentLoc),
      );

      if ((flag & ts.ElementFlags.Required) !== 0) {
        requiredCount += 1;
      }
    }

    const tupleResult: JsonSchema = {
      type: "array",
      prefixItems: itemPrefixes,
      minItems: requiredCount,
    };

    if (restSpreadSchema !== undefined) {
      tupleResult.items = restSpreadSchema;
    } else {
      tupleResult.maxItems = itemPrefixes.length;
    }

    return tupleResult;
  }

  private verifyArrayReference(entity: ts.Type): boolean {
    if ((resolveObjectTypeFlags(entity) & ts.ObjectFlags.Reference) === 0) {
      return false;
    }
    const targetSymbolName = (entity as ts.TypeReference).target.getSymbol()?.getName();
    return targetSymbolName === "Array" || targetSymbolName === "ReadonlyArray";
  }

  private verifyTupleReference(entity: ts.Type): boolean {
    if ((resolveObjectTypeFlags(entity) & ts.ObjectFlags.Reference) === 0) {
      return false;
    }
    const targetFlags = (entity as ts.TypeReference).target.objectFlags ?? 0;
    return (targetFlags & ts.ObjectFlags.Tuple) !== 0;
  }

  private inspectThenableContract(entity: ts.Type): boolean {
    const thenProperty = this.checker.getPropertyOfType(entity, "then");
    if (!thenProperty) {
      return false;
    }
    const declarationNode = thenProperty.valueDeclaration ?? this.location;
    const resolvedType = this.checker.getTypeOfSymbolAtLocation(thenProperty, declarationNode);
    return resolvedType.getCallSignatures().length > 0;
  }
}
