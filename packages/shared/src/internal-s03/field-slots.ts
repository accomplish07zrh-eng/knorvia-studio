// SPDX-License-Identifier: Apache-2.0
// The brand tuple keeps `undefined` out of the value type. A plain optional property
// would infer `T | undefined` under `exactOptionalPropertyTypes`-sensitive consumers.

export type RequiredField<T> = { readonly presence: "required"; readonly brand: [T] };
export type OptionalField<T> = { readonly presence: "optional"; readonly brand: [T] };

type PresenceOf<Field> = Field extends { readonly presence: infer Presence } ? Presence : never;
type ValueOf<Field> = Field extends { readonly brand: [infer Value] } ? Value : never;

export type Expand<Shape extends object> = {
  [Key in keyof Shape as PresenceOf<Shape[Key]> extends "required" ? Key : never]: ValueOf<
    Shape[Key]
  >;
} & {
  [Key in keyof Shape as PresenceOf<Shape[Key]> extends "optional" ? Key : never]?: ValueOf<
    Shape[Key]
  >;
};
