import assert from "node:assert/strict";
import type { expandCliCustomCommandPrompt } from "../src/custom-command-expand.js";

export type CommandExpander = typeof expandCliCustomCommandPrompt;
export type CommandCase = { name: string; run(expand: CommandExpander): unknown };

export function syntheticCommand(content: string, skills?: string[]) {
  return {
    content,
    metadata: { name: "synthetic", scope: "user", source: "synthetic.md", skills },
  };
}
const promptHeader = "Run custom command /synthetic.\nCommand source: user/synthetic.md.\n\n";

export const commandExpansionCases: CommandCase[] = [
  {
    name: "tokenizer retains quoted fragments, Unicode whitespace and universal escapes",
    run(expand) {
      const inputs: [string, string[]][] = [
        ["", []],
        ['"" \'\' ""', []],
        ["alpha beta", ["alpha", "beta"]],
        ["a''b\"\"c", ["abc"]],
        ["'two words' \"three words\"", ["two words", "three words"]],
        ["x\\ y z", ["x y", "z"]],
        ["a\\\tb", ["a\tb"]],
        ["'a\\'b' c", ["a'b", "c"]],
        ["'a\"b' \"c'd\"", ['a"b', "c'd"]],
        ["'unterminated space", ["unterminated space"]],
        ["trailing\\", ["trailing\\"]],
        ["😀\\😀 e\u0301", ["😀😀", "e\u0301"]],
        ["a\u2028b\u00a0c\uFEFFd", ["a", "b", "c", "d"]],
        ["a\u200Bb", ["a\u200Bb"]],
        ["a\u0000b", ["a\u0000b"]],
        ["'   ' ''", ["   "]],
        [String.raw`\"quoted\"`, ['"quoted"']],
        [String.raw`\\ \\`, ["\\", "\\"]],
        ["'ends\\", ["ends\\"]],
        ["x\\\ny", ["x\ny"]],
        ["a\"\" b''", ["a", "b"]],
        ["\\ ", ["\\"]],
        ["a\\ b\\", ["a b\\"]],
      ];
      const observations = [];
      const body = "<$1>|<$2>|<$3>|<$4>|<$5>|<$6>|<$7>|<$8>";
      for (const [args, words] of inputs) {
        const result = expand({ args, command: syntheticCommand(body) });
        const rendered = Array.from({ length: 8 }, (_, index) => `<${words[index] ?? ""}>`).join(
          "|",
        );
        assert.equal(result.argumentCount, words.length, JSON.stringify(args));
        assert.equal(result.prompt, promptHeader + rendered, JSON.stringify(args));
        assert.equal(result.usedArgumentsPlaceholder, true);
        observations.push({ args, result });
      }
      return observations;
    },
  },
  {
    name: "all-args precedes positional expansion without recursively replacing values",
    run(expand) {
      const inputs: [string, string, string, number, boolean][] = [
        ["$ARGUMENTS", "$2 second", "second second", 2, true],
        ["$1/$2", "$2 fixed", "$2/fixed", 2, true],
        ["$ARGUMENTS:$1", "$1 raw", "$1 raw:$1", 2, true],
        [" $0|$01|$2|$200 ", "left right", "|left|right|", 2, true],
        ["$ARGUMENTS $ARGUMENTS", "  x y  ", "x y x y", 2, true],
        ["$argumentS $$1 $-1", "alpha", "$argumentS $alpha $-1", 1, true],
        ["$１２", "x", "$１２\n\nUser arguments:\nx", 1, false],
        ["$1/$ARGUMENTS", "", "/", 0, true],
        ["$ARGUMENTS", '""', '""', 0, true],
        ["$" + "9".repeat(310), "alpha", "", 1, true],
        ["$000|$001", "alpha", "|alpha", 1, true],
        ["A$ARGUMENTS B", "$&", "A$ARGUMENTS B", 1, true],
        ["$ARGUMENTS", "$$", "$", 1, true],
        ["pre$ARGUMENTSpost", "$`", "preprepost", 1, true],
        ["pre$ARGUMENTSpost", "$'", "prepostpost", 1, true],
      ];
      return inputs.map(([content, args, body, argumentCount, usedArgumentsPlaceholder]) => {
        const result = expand({ args, command: syntheticCommand(content) });
        assert.deepEqual(result, {
          argumentCount,
          prompt: promptHeader + body,
          usedArgumentsPlaceholder,
        });
        assert.deepEqual(Object.keys(result), [
          "argumentCount",
          "prompt",
          "usedArgumentsPlaceholder",
        ]);
        return { content, args, result };
      });
    },
  },
  {
    name: "fixed prompt prose, skill instruction order and argument fallback remain exact",
    run(expand) {
      const result = expand({
        args: "  synthetic input  ",
        command: syntheticCommand("\n body  \n", ["first", "second"]),
      });
      assert.deepEqual(result, {
        argumentCount: 2,
        prompt:
          "Run custom command /synthetic.\nCommand source: user/synthetic.md.\nRequired skills: `first`, `second`.\nBefore following the command body, call the Skill tool for `first`, `second`.\n\nbody\n\nUser arguments:\nsynthetic input",
        usedArgumentsPlaceholder: false,
      });
      const empty = expand({ args: "x", command: syntheticCommand("") });
      assert.equal(empty.prompt, promptHeader + "User arguments:\nx");
      const noArgs = expand({ args: "\t \n", command: syntheticCommand("  body  ", []) });
      assert.deepEqual(noArgs, {
        argumentCount: 0,
        prompt: promptHeader + "body",
        usedArgumentsPlaceholder: false,
      });
      return { result, empty, noArgs };
    },
  },
  {
    name: "dynamic shell refusal is exact and precedes argument parsing",
    run(expand) {
      const errorMessage =
        "Custom command /synthetic uses unsupported shell expansion. Dynamic expansion is not available yet.";
      const rejected = [
        "before !`synthetic` after",
        "```! echo synthetic\n```",
        "```!\nsynthetic\n```",
        "```js\n!`synthetic`\n```",
      ];
      for (const content of rejected) {
        assert.throws(
          () =>
            expand({
              get args(): string {
                throw new Error("late args");
              },
              command: syntheticCommand(content),
            }),
          { name: "Error", message: errorMessage },
        );
      }
      const allowed = ["```! unclosed", "!`unclosed", "```js\nsynthetic\n```", "ordinary body"];
      return allowed.map((content) => {
        const result = expand({ args: "", command: syntheticCommand(content) });
        assert.equal(result.prompt, promptHeader + content);
        return { content, result };
      });
    },
  },
  {
    name: "content and metadata access stages stay ordered through the public entry",
    run(expand) {
      const events: string[] = [];
      const command = {
        get content() {
          events.push("content");
          return "$ARGUMENTS $2";
        },
        get metadata() {
          events.push("metadata");
          return syntheticCommand("").metadata;
        },
      };
      const result = expand({
        get args() {
          events.push("args");
          return "one two";
        },
        command,
      });
      assert.deepEqual(events, [
        "content",
        "args",
        "content",
        "content",
        "metadata",
        "metadata",
        "metadata",
        "metadata",
      ]);
      assert.equal(result.prompt, promptHeader + "one two two");
      return { events, result };
    },
  },
];
