import { ModelOptionMapError } from "./types.js";

interface Claim {
  readonly option: string;
  readonly order: number;
}
interface Prefix {
  readonly children: Map<string, Prefix>;
  terminal?: Claim;
  earliest?: Claim;
}

function oldest(a: Claim | undefined, b: Claim | undefined): Claim | undefined {
  return !a ? b : !b || a.order < b.order ? a : b;
}

export class PatchPathClaims {
  private readonly root: Prefix = { children: new Map() };
  private nextOrder = 0;

  write(option: string, path: readonly string[]): void {
    let prefix = this.root;
    let conflict = prefix.terminal;
    let matched = 0;
    for (const segment of path) {
      const child = prefix.children.get(segment);
      if (!child) break;
      prefix = child;
      matched += 1;
      conflict = oldest(conflict, prefix.terminal);
    }
    if (matched === path.length) conflict = oldest(conflict, prefix.earliest);
    if (conflict) {
      const display = path.length ? `$.${path.join(".")}` : "$";
      throw new ModelOptionMapError(
        `Model option maps write conflicting JSON path ${display}: ${conflict.option} and ${option}`,
      );
    }
    const claim: Claim = { option, order: this.nextOrder++ };
    prefix = this.root;
    prefix.earliest ??= claim;
    for (const segment of path) {
      let child = prefix.children.get(segment);
      if (!child) {
        child = { children: new Map() };
        prefix.children.set(segment, child);
      }
      prefix = child;
      prefix.earliest ??= claim;
    }
    prefix.terminal = claim;
  }
}
