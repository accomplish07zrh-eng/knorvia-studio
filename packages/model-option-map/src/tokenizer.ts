import { RestrictedCelError } from "./types.js";

export type RestrictedCelTokenKind =
  | "identifier"
  | "string"
  | "number"
  | "operator"
  | "punctuation"
  | "eof";

export interface RestrictedCelToken {
  readonly kind: RestrictedCelTokenKind;
  readonly value: string;
  readonly offset: number;
  readonly end: number;
}

const operatorPairs = new Set(["&&", "||", "==", "!=", "<=", ">="]);
const operatorLetters = new Set("+-*/%!<>");
const punctuationLetters = new Set("{}[](),:?.");
const escapes: Readonly<Record<string, string>> = Object.freeze({
  "'": "'",
  '"': '"',
  "\\": "\\",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
});

export function tokenizeRestrictedCel(source: string): readonly RestrictedCelToken[] {
  const scanner = new SourceScanner(source);
  const result: RestrictedCelToken[] = [];
  while (!scanner.finished) {
    if (/\s/u.test(scanner.character)) scanner.position += 1;
    else result.push(scanner.token());
  }
  result.push({ kind: "eof", value: "", offset: source.length, end: source.length });
  return Object.freeze(result);
}

class SourceScanner {
  position = 0;

  constructor(private readonly source: string) {}

  get finished(): boolean {
    return this.position >= this.source.length;
  }
  get character(): string {
    return this.source[this.position]!;
  }

  token(): RestrictedCelToken {
    const offset = this.position;
    const letter = this.character;
    let kind: RestrictedCelTokenKind;
    let value: string;
    if (letter === "'" || letter === '"') {
      kind = "string";
      value = this.stringValue(letter, offset);
    } else if (/[0-9]/u.test(letter)) {
      kind = "number";
      const literal = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(this.source.slice(offset));
      if (!literal) throw new RestrictedCelError("invalid number literal", offset);
      value = literal[0];
      this.position += value.length;
    } else if (/[A-Za-z_]/u.test(letter)) {
      kind = "identifier";
      this.position += 1;
      while (!this.finished && /[A-Za-z0-9_]/u.test(this.character)) this.position += 1;
      value = this.source.slice(offset, this.position);
    } else {
      const pair = this.source.slice(offset, offset + 2);
      if (operatorPairs.has(pair)) {
        kind = "operator";
        value = pair;
      } else if (operatorLetters.has(letter)) {
        kind = "operator";
        value = letter;
      } else if (punctuationLetters.has(letter)) {
        kind = "punctuation";
        value = letter;
      } else throw new RestrictedCelError(`unsupported token ${JSON.stringify(letter)}`, offset);
      this.position += value.length;
    }
    return { kind, value, offset, end: this.position };
  }

  private stringValue(quote: string, opening: number): string {
    const parts: string[] = [];
    this.position += 1;
    while (!this.finished) {
      const letter = this.character;
      if (letter === quote) {
        this.position += 1;
        return parts.join("");
      }
      if (letter === "\n" || letter === "\r") {
        throw new RestrictedCelError("unterminated string literal", opening);
      }
      if (letter !== "\\") {
        parts.push(letter);
        this.position += 1;
        continue;
      }
      const escapeOffset = this.position;
      this.position += 1;
      if (this.finished) throw new RestrictedCelError("unterminated string escape", escapeOffset);
      const escaped = this.character;
      const replacement = escapes[escaped];
      if (replacement !== undefined) {
        parts.push(replacement);
        this.position += 1;
        continue;
      }
      if (escaped !== "u") {
        throw new RestrictedCelError(`unsupported string escape \\${escaped}`, escapeOffset);
      }
      const digits = this.source.slice(this.position + 1, this.position + 5);
      if (!/^[0-9A-Fa-f]{4}$/u.test(digits)) {
        throw new RestrictedCelError("invalid unicode escape", escapeOffset);
      }
      parts.push(String.fromCharCode(Number.parseInt(digits, 16)));
      this.position += 5;
    }
    throw new RestrictedCelError("unterminated string literal", opening);
  }
}
