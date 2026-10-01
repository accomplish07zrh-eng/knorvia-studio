import { entryFor, errorShape, fixture, json } from "./collaboration-tool-fixture.js";
import { validInputs } from "./collaboration-tool-cases.js";
export const verdictProbes = [
  "ordinary",
  "accepted",
  "truthy-accepted",
  "length-zero",
  "iterable-map",
  "noniterable-map",
  "accept/1",
  "violations/1",
  "length/1",
  "length/2",
  "map/1",
  "0/1",
  "path/1",
  "expected/1",
  "got/1",
];
export async function observeVerdictProbe(probe: string) {
  const reads: string[] = [],
    counts = new Map<string, number>();
  const read = (field: string, value: unknown) => {
    reads.push(field);
    const count = (counts.get(field) ?? 0) + 1;
    counts.set(field, count);
    if (probe === `${field}/${count}`) throw new Error(`Synthetic verdict getter ${probe}`);
    return value;
  };
  const violation = Object.fromEntries(
    ["path", "expected", "got"].map((field) => [field, "synthetic"]),
  );
  for (const field of Object.keys(violation)) {
    const value = violation[field];
    Object.defineProperty(violation, field, { get: () => read(field, value) });
  }
  const list: any = {};
  Object.defineProperties(list, {
    length: { get: () => read("length", probe === "length-zero" ? 0 : 1) },
    0: { get: () => read("0", violation) },
    map: {
      get: () => {
        read("map", undefined);
        return function (this: unknown, callback: (value: unknown) => unknown) {
          reads.push(this === list ? "map receiver" : "wrong map receiver");
          if (probe === "iterable-map") return "ABC";
          if (probe === "noniterable-map") return {};
          return Array.prototype.map.call(list, callback);
        };
      },
    },
  });
  const verdict = {
    get accept() {
      return read(
        "accept",
        probe === "accepted" ? true : probe === "truthy-accepted" ? "yes" : false,
      );
    },
    get violations() {
      return read("violations", list);
    },
  };
  const f = fixture({ label: "probe", operation: "submit", verdict });
  let outcome;
  try {
    outcome = { output: await entryFor("submit").handler(validInputs.submit, f.context) };
  } catch (error) {
    outcome = { error: errorShape(error) };
  }
  return json({ ...outcome, reads, calls: f.calls });
}
