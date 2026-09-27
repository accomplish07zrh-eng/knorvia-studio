// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";

// Identity normalization is opt-in, never implicit.
export const field = {
  text: z.string(),
  nonempty: z.string().min(1),
  identity: z.string().trim().min(1),
  number: z.number(),
  positive: z.number().positive(),
  positiveInt: z.number().int().positive(),
  count: z.number().int().nonnegative(),
  nonnegative: z.number().nonnegative(),
  flag: z.boolean(),
  opaque: z.unknown(),
  textMap: z.record(z.string(), z.string()),
};
export const strict = z.strictObject;
type Shape = z.ZodRawShape;
type TaggedShape<K extends string, V extends string | boolean, S extends Shape> = S & {
  [P in K]: z.ZodLiteral<V>;
};

/** Keep the actual Zod object public, including shape/extend and ordered output. */
export function taggedObject<K extends string, V extends string | boolean, S extends Shape>(
  key: K,
  value: V,
  shape: S,
  beforeTag: readonly (keyof S & string)[] = [],
) {
  if (Object.hasOwn(shape, key)) throw new TypeError("Duplicate discriminator field: " + key);
  const ordered: Record<string, z.core.$ZodType> = {};
  for (const name of beforeTag) {
    if (!Object.hasOwn(shape, name)) throw new TypeError("Unknown ordered field: " + name);
    ordered[name] = shape[name]!;
  }
  Object.assign(ordered, { [key]: z.literal(value) }, shape);
  return strict(ordered as TaggedShape<K, V, S>);
}
type Variant<K extends string, R extends Record<string, Shape>> = {
  [V in keyof R & string]: z.ZodObject<TaggedShape<K, V, R[V]>, z.core.$strict>;
}[keyof R & string];

/** A registry key is the only declaration of each discriminator value. */
export function directory<K extends string, R extends Record<string, Shape>>(
  key: K,
  registry: R,
  beforeTag: Partial<{ [V in keyof R]: readonly (keyof R[V] & string)[] }> = {},
) {
  const entries = Object.entries(registry);
  if (entries.length === 0) throw new TypeError("A wire directory requires at least one case");
  const options = entries.map(([value, shape]) =>
    taggedObject<K, string, Shape>(key, value, shape, beforeTag[value]),
  );
  // Object.entries erases the key/field correlation; reconstruct that mapped union here.
  return z.discriminatedUnion(key, options as [Variant<K, R>, ...Variant<K, R>[]]);
}
