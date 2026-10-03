# Public tracing type binding qualification

The public-data-shapes.md sentence calling TraceId, QueryId, SessionId and TurnId string aliases is imprecise: the existing public types are branded string intersections. These are existing imported contracts, not declarations to reimplement or casts to invent:

```ts
export type SessionId = string & { readonly __brand: "SessionId" };
export type TurnId = string & { readonly __brand: "TurnId" };
export type TraceId = string & { readonly __brand: "TraceId" };
export type QueryId = string & { readonly __brand: "QueryId" };
```

Use the existing TraceContext/options/event types and preserve their typed values. The runtime behavior contract is unchanged. This public-declaration clarification does not contain target implementation, tests, review or patch instructions. The original frozen inputs remain unchanged.
