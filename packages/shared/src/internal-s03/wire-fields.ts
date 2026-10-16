// SPDX-License-Identifier: Apache-2.0
// Field pairs keep wire key order: Zod emits object keys in shape insertion order.
import { z, type ZodType } from "zod";
import type { RefinementCtx } from "zod";

export type WireField = readonly [string, ZodType];
type WireCheck = (value: any, ctx: RefinementCtx) => void;

function shapeFrom(fields: readonly WireField[]): Record<string, ZodType> {
  const shape: Record<string, ZodType> = {};
  for (const [key, schema] of fields) {
    shape[key] = schema;
  }
  return shape;
}

export function strictShape(fields: readonly WireField[], check?: WireCheck) {
  const locked = z.strictObject(shapeFrom(fields));
  return check ? locked.superRefine(check) : locked;
}

export function openShape(fields: readonly WireField[]) {
  return z.object(shapeFrom(fields));
}

export function looseShape(fields: readonly WireField[]) {
  return z.looseObject(shapeFrom(fields));
}

export function unionOf(discriminator: string, members: readonly ZodType[], check?: WireCheck) {
  const branch = z.discriminatedUnion(
    discriminator,
    members as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]],
  );
  return check ? branch.superRefine(check) : branch;
}
