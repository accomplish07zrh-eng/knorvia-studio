// 2026-10-03: source-exposed behavior-contract implementation of argument lexing/template projection.
// Origin: zai-org/ZCode 872ad960de7ec172591f7e1952f7849229f94521,
// apps/zcode-cli/packages/cli/src/custom-command-expand.ts.
// Existing Apache-2.0 attribution/history retained; see docs/lane-cli-20261003.md.
interface CliCustomCommandContent {
  content: string;
  metadata: {
    name: string;
    scope: string;
    skills?: string[];
    source: string;
  };
}

interface CliCustomCommandExpansion {
  argumentCount: number;
  prompt: string;
  usedArgumentsPlaceholder: boolean;
}

const ALL_ARGUMENTS_TOKEN = "$ARGUMENTS";
const FENCED_SHELL_PATTERN = /```!\s*[\s\S]*?```/;
const INLINE_SHELL_PATTERN = /!`[^`]*`/;
const POSITIONAL_ARGUMENT_PATTERN = /\$(\d+)/g;
const ARGUMENT_LEXEME_PATTERN = /\\(?:([\s\S])|$)|(['"])|(\s+)|([^\\'"\s]+)/gu;

export function expandCliCustomCommandPrompt(input: {
  args: string;
  command: CliCustomCommandContent;
}): CliCustomCommandExpansion {
  if (usesUnsupportedDynamicShell(input.command.content)) {
    throw new Error(
      `Custom command /${input.command.metadata.name} uses unsupported shell expansion. Dynamic expansion is not available yet.`,
    );
  }

  const args = input.args.trim();
  const positional = splitCliCustomCommandArguments(args);
  const hasAllArguments = input.command.content.includes(ALL_ARGUMENTS_TOKEN);
  // 分两步：原 args 带入的 $N 参与本轮展开，位置值本身不再次解析。
  const segments = input.command.content
    .replaceAll(ALL_ARGUMENTS_TOKEN, args)
    .split(POSITIONAL_ARGUMENT_PATTERN);
  const usedArgumentsPlaceholder = hasAllArguments || segments.length > 1;
  let body = segments
    .map((segment, index) => (index % 2 === 0 ? segment : (positional[Number(segment) - 1] ?? "")))
    .join("");

  if (args.length > 0 && !usedArgumentsPlaceholder) {
    body = `${body.trimEnd()}\n\nUser arguments:\n${args}`;
  }

  return {
    argumentCount: positional.length,
    prompt: [
      `Run custom command /${input.command.metadata.name}.`,
      `Command source: ${input.command.metadata.scope}/${input.command.metadata.source}.`,
      ...formatCommandSkillInstructions(input.command.metadata.skills ?? []),
      "",
      body.trim(),
    ].join("\n"),
    usedArgumentsPlaceholder,
  };
}

function formatCommandSkillInstructions(skills: string[]): string[] {
  if (skills.length === 0) return [];
  const names = skills.map((skill) => `\`${skill}\``).join(", ");
  return [
    `Required skills: ${names}.`,
    `Before following the command body, call the Skill tool for ${names}.`,
  ];
}

function splitCliCustomCommandArguments(input: string): string[] {
  const words: string[] = [];
  let fragments: string[] = [];
  let delimiter: string | undefined;
  const flush = (): void => {
    const word = fragments.join("");
    if (word.length > 0) words.push(word);
    fragments = [];
  };
  for (const lexeme of input.matchAll(ARGUMENT_LEXEME_PATTERN)) {
    if (lexeme[0].startsWith("\\")) {
      fragments.push(lexeme[1] ?? "\\");
    } else if (lexeme[2] !== undefined) {
      if (delimiter === lexeme[2]) delimiter = undefined;
      else if (delimiter === undefined) delimiter = lexeme[2];
      else fragments.push(lexeme[2]);
    } else if (lexeme[3] !== undefined && delimiter === undefined) {
      flush();
    } else {
      fragments.push(lexeme[0]);
    }
  }
  flush();
  return words;
}

function usesUnsupportedDynamicShell(content: string): boolean {
  return INLINE_SHELL_PATTERN.test(content) || FENCED_SHELL_PATTERN.test(content);
}
